/** Prize-announcement extension; fixed timestamps never roll forward on restart. */
export const launchStartedAt = "2026-10-25T12:50:40.350Z";
export const launchEndsAt = "2026-11-03T12:50:40.350Z";

export function launchPolicy(now = Date.now()) {
  const launch = now >= Date.parse(launchStartedAt) && now < Date.parse(launchEndsAt);
  return {
    launch,
    dailyTurns: launch ? 5000 : 250,
    sessionTurns: launch ? 100 : 40,
    maxSessions: launch ? 200 : 80,
    concurrentRuns: launch ? 3 : 2,
    maxQueued: launch ? 80 : 40,
    queueWaitMs: 240_000,
    sessionBurst: 12,
    // Conservative application accounting leaves room below the $50 provider cap.
    spendKey: launch ? "launch-2026-10-25" : new Date(now).toISOString().slice(0, 10),
    spendLimitMicros: launch ? 45_000_000 : 3_000_000,
  };
}
