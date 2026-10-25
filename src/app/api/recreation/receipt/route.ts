import { readFile } from "node:fs/promises";
import { sameOrigin } from "@/lib/ai/policy";
import { getSession } from "@/lib/ai/session";
export async function GET(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  const session = getSession(request.headers.get("cookie"), false);
  const pdf = new URL(request.url).searchParams.get("format") === "pdf";
  const file = pdf ? session?.booking.receiptPdfPath() : session?.booking.receiptPath();
  if (!file)
    return new Response("No receipt captured in this session.", { status: 404 });
  // Private runtime evidence is never a deployment/build asset.
  return new Response(await readFile(/* turbopackIgnore: true */ file), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "image/png",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename=city-receipt.${pdf ? "pdf" : "png"}`,
    },
  });
}
