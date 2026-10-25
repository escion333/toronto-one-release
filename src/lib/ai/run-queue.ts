import { launchPolicy } from "./launch-policy.ts";

export class AdmissionError extends Error {
  readonly status: number;
  constructor(message: string, status = 429) {
    super(message);
    this.status = status;
  }
}

type Waiter = {
  owner: string;
  grant: (release: () => void) => void;
  cleanup: () => void;
};

/** Single-container FIFO. Queued work has no model calls or browser context. */
export class RunQueue {
  private active = 0;
  private owners = new Set<string>();
  private waiting: Waiter[] = [];

  private policy: () => ReturnType<typeof launchPolicy>;
  constructor(policy = () => launchPolicy()) {
    this.policy = policy;
  }

  status() {
    return { active: this.active, queued: this.waiting.length };
  }

  async acquire(owner: string, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new DOMException("Request stopped.", "AbortError");
    if (this.owners.has(owner))
      throw new AdmissionError("A request is already running for this visit.", 409);
    const policy = this.policy();
    if (this.waiting.length >= policy.maxQueued)
      throw new AdmissionError("The service is busy. Please try again shortly.", 503);
    this.owners.add(owner);
    if (!this.waiting.length && this.active < policy.concurrentRuns)
      return this.grant(owner);
    return new Promise<() => void>((resolve, reject) => {
      const remove = (error: Error) => {
        const index = this.waiting.indexOf(waiter);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        this.owners.delete(owner);
        waiter.cleanup();
        reject(error);
      };
      const abort = () => remove(new DOMException("Request stopped.", "AbortError"));
      const timer = setTimeout(
        () =>
          remove(
            new AdmissionError("The service is busy. Please try again shortly.", 503),
          ),
        policy.queueWaitMs,
      );
      timer.unref();
      const waiter: Waiter = {
        owner,
        grant: resolve,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        },
      };
      this.waiting.push(waiter);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }

  private grant(owner: string) {
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.owners.delete(owner);
      while (this.waiting.length && this.active < this.policy().concurrentRuns) {
        const next = this.waiting.shift();
        if (!next) break;
        next.cleanup();
        next.grant(this.grant(next.owner));
      }
    };
  }
}
