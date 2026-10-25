type Storage = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
};

/** Call inside the host's storage transaction; retains no resident or receipt content. */
export async function applyLedger(
  storage: Storage,
  input: unknown,
  configuredLimit = 50,
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
    !/^(?:[a-f0-9]{64}|usage-\d{4}-\d{2}-\d{2})$/.test(key)
  )
    return new Response("Invalid key", { status: 400 });
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
        ? Math.min(configuredLimit, 100)
        : 50;
    if (count >= limit) return new Response("Daily limit", { status: 429 });
    await storage.put(key, count + 1);
  } else return new Response("Invalid action", { status: 400 });
  return Response.json({ ok: true });
}
