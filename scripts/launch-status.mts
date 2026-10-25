/** Operator-only readout; prints aggregate counters, never keys or resident content. */
const base = "https://www.tomsanee.com/toronto-one";
const response = await fetch(base + "/api/health");
if (!response.ok) throw new Error(`Health HTTP ${response.status}`);
const health = await response.json();
console.log(
  JSON.stringify(
    {
      launch: health.launch,
      admission: health.admission,
      configuredCapacity: health.configuredCapacity,
      runningCapacityRequest: health.runningCapacityRequest,
      keepAwakeUntil: health.keepAwakeUntil,
    },
    null,
    2,
  ),
);
if (process.env.AI_GATEWAY_API_KEY) {
  const credits = await fetch("https://ai-gateway.vercel.sh/v1/credits", {
    headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` },
  });
  if (!credits.ok) throw new Error(`Gateway credits HTTP ${credits.status}`);
  const data = await credits.json();
  console.log(
    JSON.stringify(
      { gatewayCreditBalance: data.balance, gatewayLifetimeSpend: data.total_used },
      null,
      2,
    ),
  );
}
