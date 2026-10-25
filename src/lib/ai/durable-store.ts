/** Optional private hosting ledger. Local development retains its synced filesystem journal. */
export async function durableStore(
  action: "exists" | "claim" | "confirm" | "reserve",
  key: string,
  value?: unknown,
) {
  const endpoint = process.env.PRIVATE_STORE_URL;
  const token = process.env.PRIVATE_STORE_TOKEN;
  if (!endpoint || !token) throw new Error("Durable write protection is unavailable.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, key, value }),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "A booking attempt already exists. Check your City account before trying again."
        : response.status === 429
          ? "Today's public AI allowance is used up. Please visit again tomorrow."
          : "Durable write protection is unavailable. Nothing new will be submitted.",
    );
  const data: unknown = await response.json();
  return (
    typeof data === "object" &&
    data !== null &&
    "exists" in data &&
    data.exists === true
  );
}
