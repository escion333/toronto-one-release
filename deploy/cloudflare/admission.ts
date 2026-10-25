import { launchPolicy } from "../../src/lib/ai/launch-policy.ts";

const minute = 60_000;
const idleExpiry = 2 * minute;
const chatBurst = 60;
const anonymousBurst = 30;

type Bucket = {
  chat: number;
  anonymous: number;
  updatedAt: number;
};

/** Capacity changes only at a natural start, never by interrupting a City booking. */
export function containerAllocation(now = Date.now()) {
  return launchPolicy(now).launch
    ? { profile: "launch", vcpu: 2, memoryMib: 8192, diskMb: 16384 }
    : { profile: "normal", vcpu: 1, memoryMib: 4096, diskMb: 8192 };
}

/** A random per-isolate salt prevents enumerating stored hashes back to IP addresses. */
export async function hashClientAddress(address: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}\0${address}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Soft edge protection only: isolated memory is bounded and never stores raw IPs. */
export class ChatAdmission {
  private readonly buckets = new Map<string, Bucket>();
  private readonly salt = crypto.randomUUID();
  private readonly maxEntries: number;

  constructor(maxEntries = 4096) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1)
      throw new Error("Admission storage must have a positive bounded size.");
    this.maxEntries = maxEntries;
  }

  get size() {
    return this.buckets.size;
  }

  async admit(request: Request, now = Date.now()) {
    // CF-Connecting-IP is supplied by Cloudflare at this Worker boundary.
    // Missing platform headers share one conservative fallback bucket.
    const key = await hashClientAddress(
      request.headers.get("CF-Connecting-IP") ?? "unknown",
      this.salt,
    );
    const cookie = request.headers.get("cookie") ?? "";
    // This recognizes a returning-browser cookie, not authenticated ownership.
    // Session ownership and quota enforcement remain in application code.
    const anonymous =
      !/(?:^|;\s*)toronto-one-agent=[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}(?:;|$)/i.test(
        cookie,
      );
    // Map order follows last access, so expired entries can be pruned from the front.
    for (const [candidate, bucket] of this.buckets) {
      if (now - bucket.updatedAt < idleExpiry) break;
      this.buckets.delete(candidate);
    }
    const previous = this.buckets.get(key);
    this.buckets.delete(key);
    if (this.buckets.size >= this.maxEntries) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
    const elapsed = previous ? Math.max(0, now - previous.updatedAt) : 0;
    const bucket: Bucket = {
      chat: Math.min(
        chatBurst,
        (previous?.chat ?? chatBurst) + (elapsed * chatBurst) / minute,
      ),
      anonymous: Math.min(
        anonymousBurst,
        (previous?.anonymous ?? anonymousBurst) + (elapsed * anonymousBurst) / minute,
      ),
      updatedAt: now,
    };
    const retryMs = Math.max(
      ((1 - bucket.chat) * minute) / chatBurst,
      anonymous ? ((1 - bucket.anonymous) * minute) / anonymousBurst : 0,
    );
    const allowed = retryMs <= 0;
    if (allowed) {
      bucket.chat--;
      if (anonymous) bucket.anonymous--;
    }
    this.buckets.set(key, bucket);
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(retryMs / 1000)),
    };
  }
}
