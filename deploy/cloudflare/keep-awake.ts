type WarmContext = {
  container: {
    running: boolean;
    setInactivityTimeout(ms: number): Promise<void>;
  };
  storage: {
    getAlarm(): Promise<number | null>;
    setAlarm(at: number): Promise<void>;
  };
};

const idleMs = 2 * 60_000;
const renewalMs = 60 * 60_000;
const warmMs = 2 * renewalMs;

export function keepAwakeSettings(until: string | undefined, now = Date.now()) {
  const deadline = Date.parse(until ?? "");
  const active = Number.isFinite(deadline) && deadline > now;
  return {
    active,
    timeoutMs: active ? Math.max(idleMs, Math.min(warmMs, deadline - now)) : idleMs,
    nextAlarmAt: active ? Math.min(now + renewalMs, deadline) : null,
  };
}

/** Renew server uptime only. Never calls the AI or opens a resident browser. */
export async function maintainWarmth(
  ctx: WarmContext,
  until: string | undefined,
  now = Date.now(),
) {
  const settings = keepAwakeSettings(until, now);
  if (ctx.container.running)
    await ctx.container.setInactivityTimeout(settings.timeoutMs);
  if (settings.nextAlarmAt !== null) {
    const existing = await ctx.storage.getAlarm();
    // Preserve an alarm already due, including when its handler wakes the object.
    if (existing === null || existing > settings.nextAlarmAt)
      await ctx.storage.setAlarm(settings.nextAlarmAt);
  }
  return settings;
}
