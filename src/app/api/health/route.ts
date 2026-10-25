import { connection } from "next/server";

import { admissionStatus } from "@/lib/ai/limits";

export async function GET() {
  await connection();
  return Response.json(
    { ok: true, admission: admissionStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
