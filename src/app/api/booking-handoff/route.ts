import { z } from "zod";
import { sameOrigin, verifyQuotes } from "@/lib/ai/policy";
import { getSession, approvedBookingPlan } from "@/lib/ai/session";
const schema = z.object({
  id: z.string().uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  approved: z.literal(true),
});
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  const session = getSession(request.headers.get("cookie"), false);
  if (!session)
    return new Response("The preview session expired. Check the activity again.", {
      status: 410,
    });
  if (session.busy)
    return new Response("Wait for the current check to finish.", { status: 409 });
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 2000) throw new Error();
    input = schema.parse(JSON.parse(raw));
  } catch {
    return new Response("An explicit approval matching the preview is required.", {
      status: 400,
    });
  }
  session.busy = true;
  let phase = "preview";
  try {
    const plan = approvedBookingPlan(session, input.id, input.digest);
    let checkedAt = "";
    await session.browser.run(async () => {
      for (const url of new Set(
        plan.result.facts.map((fact) => fact.sourceUrl ?? plan.result.sourceUrl),
      )) {
        phase = url === plan.result.sourceUrl ? "activity" : "listing";
        const current = await session.browser.open(url);
        const quotes = plan.result.facts
          .filter((fact) => (fact.sourceUrl ?? plan.result.sourceUrl) === url)
          .map((fact) => fact.quote);
        if (url === plan.result.sourceUrl) verifyQuotes(current.text, quotes);
        else {
          const linked = current.controls.find(
            (control) => control.href === plan.result.sourceUrl && control.context,
          );
          if (!linked?.context) throw new Error("The linked activity listing changed.");
          verifyQuotes(linked.context, quotes);
        }
        checkedAt = current.checkedAt;
      }
    });
    plan.consumed = true;
    const result = session.results.find((result) => result.id === plan.result.id);
    if (result) result.handoff = { url: plan.result.sourceUrl, checkedAt };
    return Response.json(
      {
        status: "handoff_ready",
        reservationStatus: "not_reserved",
        url: plan.result.sourceUrl,
        checkedAt,
        message:
          "Activity details rechecked. Continue on the official City booking site to sign in, select the participant, review waivers/fees and complete the reservation. No spot is held or booked by Toronto One.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unavailable =
      error instanceof Error &&
      /Timeout|page\.goto|net::|Target.*closed/i.test(error.name + error.message);
    return new Response(
      unavailable
        ? `The official ${phase === "listing" ? "activity listing" : "activity detail page"} did not respond to the recheck. Nothing was reserved. Try this read-only recheck again, or open the official source.`
        : "This preview expired or its source details changed. Nothing was reserved. Ask the raccoon to inspect the activity again.",
      {
        status: unavailable ? 502 : 409,
        headers: {
          "X-Toronto-One-Recheck": `${phase}:${unavailable ? "unavailable" : "changed"}`,
        },
      },
    );
  } finally {
    session.busy = false;
    session.touchedAt = Date.now();
  }
}
