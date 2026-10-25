import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

export const maxSessions = Number(process.env.DEMO_MAX_SESSIONS ?? 8);
const maxConcurrent = Number(process.env.DEMO_MAX_CONCURRENT_RUNS ?? 2);
const sessionTurns = new Map<string, number>();
let active = 0;
const directory =
  process.env.PRIVATE_DATA_DIR ?? path.join(process.cwd(), ".local", "booking");
const ledgerPath = path.join(directory, "usage.json");

/** Reserve before a model call; failed calls still consume a turn. Single replica only. */
export function reserveRun(owner: string, now = Date.now()): () => void {
  if (active >= maxConcurrent)
    throw new Error(
      "The raccoon is helping a few neighbours. Please try again shortly.",
    );
  if ((sessionTurns.get(owner) ?? 0) >= Number(process.env.DEMO_SESSION_TURNS ?? 12))
    throw new Error("This visit has reached its AI limit. Please come back later.");
  const day = new Date(now).toISOString().slice(0, 10);
  let count = 0;
  try {
    const stored: unknown = JSON.parse(readFileSync(ledgerPath, "utf8"));
    if (
      typeof stored === "object" &&
      stored !== null &&
      "day" in stored &&
      stored.day === day &&
      "count" in stored &&
      typeof stored.count === "number"
    )
      count = stored.count;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw new Error(
        "Usage limits are temporarily unavailable. Please try again later.",
      );
  }
  if (count >= Number(process.env.DEMO_DAILY_TURNS ?? 50))
    throw new Error(
      "Today's public AI allowance is used up. Please visit again tomorrow.",
    );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(`${ledgerPath}.tmp`, JSON.stringify({ day, count: count + 1 }), {
    mode: 0o600,
  });
  renameSync(`${ledgerPath}.tmp`, ledgerPath);
  sessionTurns.set(owner, (sessionTurns.get(owner) ?? 0) + 1);
  active++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active--;
    }
  };
}

export function forgetRunOwner(owner: string) {
  sessionTurns.delete(owner);
}
