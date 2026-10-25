export type TimingPhase =
  | "browser_startup"
  | "navigation"
  | "page_loading"
  | "service_discovery"
  | "form_entry"
  | "external_wait"
  | "model_inference";
export type TimingSpan = { phase: TimingPhase; ms: number; ok: boolean };

// Durations only: no URLs, resident fields, page content, credentials or prompts.
export class ExecutionTimings {
  readonly spans: TimingSpan[] = [];
  record(phase: TimingPhase, ms: number, ok = true) {
    this.spans.push({ phase, ms: Math.round(ms), ok });
    if (this.spans.length > 200) this.spans.shift();
  }
  async measure<T>(phase: TimingPhase, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    let ok = false;
    try {
      const result = await operation();
      ok = true;
      return result;
    } finally {
      this.record(phase, performance.now() - start, ok);
    }
  }
}
