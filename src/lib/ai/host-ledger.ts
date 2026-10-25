import { launchPolicy } from "./launch-policy.ts";

export type LedgerStorage = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
};

/** Call inside the host's storage transaction; retains no resident or receipt content. */
export async function applyLedger(
  storage: LedgerStorage,
  input: unknown,
  configuredLimit = 50,
  now = Date.now(),
) {
  if (
    typeof input !== "object" ||
    input === null ||
    !("key" in input) ||
    !("action" in input)
  )
    return new Response("Invalid input", { status: 400 });
  const { key, action } = input;
  if (
    typeof key !== "string" ||
    !/^(?:[a-f0-9]{64}|(?:usage|spend)-(?:launch-)?\d{4}-\d{2}-\d{2})$/.test(key)
  )
    return new Response("Invalid key", { status: 400 });
  if (key.startsWith("spend-")) return applySpend(storage, input, key, now);
  const previous = await storage.get(key);
  if (action === "exists") return Response.json({ exists: previous !== undefined });
  if (action === "claim" && /^[a-f0-9]{64}$/.test(key)) {
    if (previous !== undefined) return new Response("Attempt exists", { status: 409 });
    await storage.put(key, { status: "outcome_unknown", at: Date.now() });
  } else if (action === "confirm" && /^[a-f0-9]{64}$/.test(key)) {
    if (previous === undefined)
      return new Response("No claimed attempt", { status: 409 });
    await storage.put(key, { status: "confirmed", at: Date.now() });
  } else if (action === "reserve" && key.startsWith("usage-")) {
    const count = typeof previous === "number" ? previous : 0;
    const limit =
      Number.isInteger(configuredLimit) && configuredLimit > 0
        ? Math.min(configuredLimit, 10_000)
        : 50;
    if (count >= limit) return new Response("Daily limit", { status: 429 });
    await storage.put(key, count + 1);
  } else return new Response("Invalid action", { status: 400 });
  return Response.json({ ok: true });
}

type Reservation = {
  heldMicros: number;
  status: "reserved" | "settled";
  actualMicros?: number;
};

function isMicros(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function reservation(value: unknown): Reservation | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("heldMicros" in value) ||
    !isMicros(value.heldMicros) ||
    value.heldMicros < 1 ||
    !("status" in value)
  )
    return;
  if (value.status === "reserved")
    return { heldMicros: value.heldMicros, status: "reserved" };
  if (
    value.status === "settled" &&
    "actualMicros" in value &&
    isMicros(value.actualMicros) &&
    value.actualMicros <= value.heldMicros
  )
    return {
      heldMicros: value.heldMicros,
      status: "settled",
      actualMicros: value.actualMicros,
    };
}

async function applySpend(
  storage: LedgerStorage,
  input: { action: unknown },
  key: string,
  now: number,
) {
  if (
    !["reserve-spend", "settle-spend"].includes(String(input.action)) ||
    !("value" in input) ||
    typeof input.value !== "object" ||
    input.value === null ||
    !("id" in input.value) ||
    typeof input.value.id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      input.value.id,
    ) ||
    !("amountMicros" in input.value) ||
    !isMicros(input.value.amountMicros)
  )
    return new Response("Invalid spend input", { status: 400 });

  const { id, amountMicros } = input.value;
  const policy = launchPolicy(now);
  // Only the host clock/policy can open a bucket. Old buckets can settle existing
  // calls, but expiry never releases an unknown provider outcome or opens a call.
  if (input.action === "reserve-spend" && key !== `spend-${policy.spendKey}`)
    return new Response("Spend window expired", { status: 409 });
  const total = await storage.get(key);
  if (total !== undefined && !isMicros(total))
    return new Response("Spend ledger unavailable", { status: 503 });
  const charged = total ?? 0;
  const reservationKey = `${key}:reservation:${id}`;
  const stored = await storage.get(reservationKey);
  const held = reservation(stored);
  if (
    stored !== undefined &&
    (!held ||
      total === undefined ||
      (held.status === "reserved" && charged < held.heldMicros))
  )
    return new Response("Spend ledger unavailable", { status: 503 });

  if (input.action === "reserve-spend") {
    if (held) {
      if (held.status === "reserved" && held.heldMicros === amountMicros)
        return Response.json({ ok: true });
      return new Response("Spend reservation exists", { status: 409 });
    }
    if (
      amountMicros < 1 ||
      amountMicros > policy.spendLimitMicros ||
      charged > policy.spendLimitMicros - amountMicros
    )
      return new Response("Public AI budget reached", { status: 429 });
    // This order also fails conservatively in the single-process development
    // filesystem adapter: a crash can over-count a hold, never lose a charge.
    await storage.put(key, charged + amountMicros);
    await storage.put(reservationKey, { heldMicros: amountMicros, status: "reserved" });
  } else {
    if (!held || amountMicros > held.heldMicros)
      return new Response("No matching spend reservation", { status: 409 });
    if (held.status === "settled")
      return held.actualMicros === amountMicros
        ? Response.json({ ok: true })
        : new Response("Spend already settled", { status: 409 });
    if (charged < held.heldMicros)
      return new Response("Spend ledger unavailable", { status: 503 });
    // Mark settled before refunding. An interrupted local write may retain the
    // larger hold; retry cannot apply the refund twice. Hosted calls are atomic.
    await storage.put(reservationKey, {
      heldMicros: held.heldMicros,
      status: "settled",
      actualMicros: amountMicros,
    });
    await storage.put(key, charged - held.heldMicros + amountMicros);
  }
  return Response.json({ ok: true });
}
