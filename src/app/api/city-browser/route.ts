import { getSession } from "@/lib/ai/session";
import { sameOrigin } from "@/lib/ai/policy";

export async function GET(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  const session = getSession(request.headers.get("cookie"), false);
  return Response.json(
    session && !session.busy ? session.booking.residentView() : { available: false },
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
