import { durableStore } from "./durable-store.ts";
import { launchPolicy } from "./launch-policy.ts";
import { AdmissionError, RunQueue } from "./run-queue.ts";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

const globalAdmission = globalThis as typeof globalThis & {
  torontoOneAdmission?: {
    sessionTurns: Map<string, { launch: boolean; turns: number }>;
    attempts: Map<string, number[]>;
    queue: RunQueue;
  };
};
const { sessionTurns, attempts, queue } = (globalAdmission.torontoOneAdmission ??= {
  sessionTurns: new Map(),
  attempts: new Map(),
  queue: new RunQueue(),
});
export const admissionStatus = () => queue.status();

/** Reserve an execution slot before charging usage; cancelled waiters cost no turns. */
export async function reserveRun(
  owner: string,
  signal?: AbortSignal,
): Promise<() => void> {
  const now = Date.now();
  const recent = (attempts.get(owner) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= launchPolicy(now).sessionBurst)
    throw new AdmissionError("Please wait a moment before sending another message.");
  recent.push(now);
  attempts.set(owner, recent);
  const release = await queue.acquire(owner, signal);
  try {
    signal?.throwIfAborted();
    const policy = launchPolicy();
    const retained = sessionTurns.get(owner);
    const used = retained?.launch === policy.launch ? retained.turns : 0;
    if (used >= policy.sessionTurns)
      throw new AdmissionError("Please come back later to continue this conversation.");
    const day = new Date().toISOString().slice(0, 10);
    const key = `usage-${policy.launch ? "launch-" : ""}${day}`;
    if (process.env.PRIVATE_STORE_URL) {
      await durableStore("reserve", key);
    } else {
      const directory =
        process.env.PRIVATE_DATA_DIR ?? path.join(process.cwd(), ".local", "booking");
      const ledgerPath = path.join(directory, "usage.json");
      let counts: Record<string, number> = {};
      try {
        const stored: unknown = JSON.parse(readFileSync(ledgerPath, "utf8"));
        if (
          typeof stored === "object" &&
          stored !== null &&
          "counts" in stored &&
          typeof stored.counts === "object" &&
          stored.counts !== null
        ) {
          counts = Object.fromEntries(
            Object.entries(stored.counts).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === "number" &&
                Number.isSafeInteger(entry[1]) &&
                entry[1] >= 0,
            ),
          );
        }
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
          throw new AdmissionError(
            "The service is temporarily unavailable. Please try again shortly.",
            503,
          );
      }
      if ((counts[key] ?? 0) >= policy.dailyTurns)
        throw new AdmissionError(
          "The service is temporarily unavailable. Please try again later.",
        );
      counts[key] = (counts[key] ?? 0) + 1;
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(`${ledgerPath}.tmp`, JSON.stringify({ counts }), { mode: 0o600 });
      renameSync(`${ledgerPath}.tmp`, ledgerPath);
    }
    sessionTurns.set(owner, { launch: policy.launch, turns: used + 1 });
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

export function forgetRunOwner(owner: string) {
  sessionTurns.delete(owner);
  attempts.delete(owner);
}
