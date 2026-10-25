import { configuredModel, gatewayConfigured } from "@/lib/ai/agent";
import { connection } from "next/server";
export async function GET() {
  await connection();
  return Response.json(
    {
      configured: gatewayConfigured(),
      model: configuredModel(),
      booking: "local_authenticated_zero_dollar_checkout",
      storage: "ephemeral_session",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
