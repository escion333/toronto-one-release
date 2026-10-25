import { remoteCityEnabled } from "@/lib/ai/remote-desktop";
import { z } from "zod";
import { BookingStepError } from "@/lib/ai/recreation-booking";
import { sameOrigin } from "@/lib/ai/policy";
import { getSession, sessionCookie, saveConfirmedBooking } from "@/lib/ai/session";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["connect", "resume", "disconnect"]) }),
  z.object({ action: z.literal("prepare"), resultId: z.string().uuid() }),
  z.object({ action: z.literal("participant"), id: z.string().uuid() }),
  z.object({
    action: z.literal("approve"),
    id: z.string().uuid(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    approved: z.literal(true),
  }),
  z.object({ action: z.literal("reconcile") }),
  z.object({ action: z.literal("capture_receipt") }),
]);
export async function GET(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  const session = getSession(request.headers.get("cookie"), false);
  return Response.json(
    session?.booking?.snapshot() ?? {
      status: "disconnected",
      message: "Connect your City account to prepare a real reservation.",
      timings: [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  // A native headed session is intentionally local-demo only.
  if (
    !remoteCityEnabled() &&
    !/^(127\.0\.0\.1|localhost)$/.test(new URL(request.url).hostname)
  )
    return new Response("Authenticated booking is available only in the local demo.", {
      status: 403,
    });
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 2000) throw new Error();
    input = inputSchema.parse(JSON.parse(raw));
  } catch {
    return new Response("Choose a valid booking action.", { status: 400 });
  }
  const session = getSession(request.headers.get("cookie"));
  if (!session) return new Response("Session unavailable.", { status: 503 });
  if (session.busy)
    return new Response("Wait for the current operation to finish.", { status: 409 });
  session.busy = true;
  const operationStart = performance.now();
  const spanIndex = session.booking.timing.spans.length;
  let ok = false;
  try {
    session.booking.pauseResidentControl();
    if (input.action === "disconnect") await session.booking.close();
    else if (input.action === "connect") await session.booking.connect();
    else if (input.action === "resume") await session.booking.resume();
    else if (input.action === "participant")
      await session.booking.selectParticipant(input.id);
    else if (input.action === "approve")
      await session.booking.finish(input.id, input.digest);
    else if (input.action === "reconcile") await session.booking.captureReceipt();
    else if (input.action === "capture_receipt")
      await session.booking.capturePrintableReceipt();
    else if (input.action === "prepare") {
      const result = session.results.find(
        (r) => r.id === input.resultId && r.kind === "recreation",
      );
      if (!result)
        return new Response("Choose an activity found in this session.", {
          status: 409,
        });
      await session.booking.requestPreparation(result.sourceUrl);
    }
    await saveConfirmedBooking(session);
    ok = true;
    return Response.json(session.booking.snapshot(), {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(
          session,
          process.env.PUBLIC_ORIGIN?.startsWith("https:") ||
            new URL(request.url).protocol === "https:",
        ),
      },
    });
  } catch (error) {
    session.booking.preparationFailed(
      error instanceof BookingStepError
        ? error.message
        : "The City's preparation step did not complete. Inspect the City browser and resume; nothing is confirmed.",
    );
    const state = session.booking.snapshot();
    return new Response(
      state.status === "outcome_unknown"
        ? state.message
        : error instanceof BookingStepError
          ? error.message
          : "The City browser could not complete this step. Inspect the browser for a sign-in requirement, changed form or portal error, then resume. No automatic booking retry will occur.",
      { status: 502 },
    );
  } finally {
    session.booking.recordOperation(input.action, operationStart, spanIndex, ok);
    session.booking.releaseResidentControl();
    session.busy = false;
    session.touchedAt = Date.now();
  }
}
