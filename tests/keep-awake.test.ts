import assert from "node:assert/strict";
import test from "node:test";
import { keepAwakeSettings, maintainWarmth } from "../deploy/cloudflare/keep-awake.ts";

const now = Date.parse("2026-10-25T10:00:00Z");
const hour = 60 * 60_000;
const until = new Date(now + 7 * 24 * hour).toISOString();

test("the review window uses a bounded timeout and an earlier renewal", () => {
  assert.deepEqual(keepAwakeSettings(until, now), {
    active: true,
    timeoutMs: 2 * hour,
    nextAlarmAt: now + hour,
  });
});

test("the last renewal lands at the deadline, then normal idle sleep resumes", () => {
  const end = Date.parse(until);
  assert.deepEqual(keepAwakeSettings(until, end - 10 * 60_000), {
    active: true,
    timeoutMs: 10 * 60_000,
    nextAlarmAt: end,
  });
  for (const date of [undefined, "invalid", new Date(now).toISOString()])
    assert.deepEqual(keepAwakeSettings(date, now), {
      active: false,
      timeoutMs: 2 * 60_000,
      nextAlarmAt: null,
    });
});

test("renewal preserves an alarm already due and never starts a container", async () => {
  const timeouts: number[] = [];
  const alarms: number[] = [];
  const ctx = {
    container: {
      running: true,
      setInactivityTimeout: async (ms: number) => {
        timeouts.push(ms);
      },
    },
    storage: {
      getAlarm: async () => now - 1,
      setAlarm: async (at: number) => {
        alarms.push(at);
      },
    },
  };
  await maintainWarmth(ctx, until, now);
  assert.deepEqual(timeouts, [2 * hour]);
  assert.deepEqual(alarms, []);
});

test("a fresh object schedules renewal, and expiry does not schedule another", async () => {
  const alarms: number[] = [];
  const timeouts: number[] = [];
  const ctx = {
    container: {
      running: false,
      setInactivityTimeout: async (ms: number) => {
        timeouts.push(ms);
      },
    },
    storage: {
      getAlarm: async () => null,
      setAlarm: async (at: number) => {
        alarms.push(at);
      },
    },
  };
  await maintainWarmth(ctx, until, now);
  assert.deepEqual(alarms, [now + hour]);
  assert.deepEqual(timeouts, []);
  ctx.container.running = true;
  await maintainWarmth(ctx, until, Date.parse(until));
  assert.deepEqual(alarms, [now + hour]);
  assert.deepEqual(timeouts, [2 * 60_000]);
});
