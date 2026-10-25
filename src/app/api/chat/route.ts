import { reserveRun } from "@/lib/ai/limits";
import { randomUUID } from "node:crypto";
import { appBasePath } from "@/lib/app-path";
import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { createCityAgent, gatewayConfigured } from "@/lib/ai/agent";
import { publicAIError } from "@/lib/ai/errors";
import { getSession, removeSession, sessionCookie } from "@/lib/ai/session";
import { sameOrigin } from "@/lib/ai/policy";

const inputSchema = z.object({
  message: z.object({
    id: z.string().min(1).max(100),
    text: z.string().trim().min(1).max(6000),
  }),
});
export async function GET(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  const session = getSession(request.headers.get("cookie"), false);
  return Response.json(
    {
      messages: session?.messages ?? [],
      results: session?.results ?? [],
      timings: session?.browser.timing.spans ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  if (!gatewayConfigured())
    return new Response(
      "AI Gateway is not configured. Add AI_GATEWAY_API_KEY to the server's .env.local and restart the app. A ChatGPT subscription does not provide API access.",
      { status: 503 },
    );
  if (Number(request.headers.get("content-length")) > 16_000)
    return new Response("Message too large.", { status: 413 });
  const raw = await request.text();
  if (raw.length > 16_000) return new Response("Message too large.", { status: 413 });
  let input;
  try {
    input = inputSchema.parse(JSON.parse(raw));
  } catch {
    return new Response("Send one text message of up to 6,000 characters.", {
      status: 400,
    });
  }
  let session;
  try {
    session = getSession(request.headers.get("cookie"));
  } catch {
    return new Response("All local sessions are in use. Try again later.", {
      status: 503,
    });
  }
  if (!session)
    return new Response("Could not create a local session.", { status: 503 });
  if (session.busy)
    return new Response(
      "A request is already running. Stop it or wait before retrying.",
      { status: 409 },
    );
  let releaseUsage: () => void;
  try {
    releaseUsage = await reserveRun(session.id);
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Please try again later.",
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  session.busy = true;
  const userMessage = {
    id: input.message.id,
    role: "user" as const,
    parts: [{ type: "text" as const, text: input.message.text }],
  };
  // Only server-retained assistant/tool messages are trusted, never client-supplied tool output or approvals.
  const previousIndex = session.messages.findIndex((m) => m.id === userMessage.id);
  const previous =
    previousIndex >= 0 ? session.messages.slice(0, previousIndex) : session.messages;
  const messages = [...previous.slice(-30), userMessage];
  session.messages = messages;
  const release = () => {
    releaseUsage();
    session.busy = false;
    session.touchedAt = Date.now();
  };
  const runStarted = performance.now();
  try {
    return await createAgentUIStreamResponse({
      agent: createCityAgent(session),
      uiMessages: messages,
      generateMessageId: randomUUID,
      abortSignal: request.signal,
      timeout: { totalMs: 180_000 },
      sendReasoning: false,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(
          session,
          process.env.PUBLIC_ORIGIN?.startsWith("https:") ||
            new URL(request.url).protocol === "https:",
        ),
      },
      onError: publicAIError,
      onEnd: async ({ messages: completed, isAborted, isCancelled, outcome }) => {
        if (isAborted || isCancelled) await session.browser.close();
        if (!isAborted && !isCancelled && outcome.status === "completed")
          session.messages = completed;
        const allowedNames = new Set([
          "recreationBookingStatus",
          "prepareRecreationBooking",
          "recreationSearch",
          "lookupVotingPlace",
          "browserOpen",
          "browserObserve",
          "browserAct",
          "requestResidentInput",
          "requestStreetAddress",
          "publishResult",
          "citeSource",
        ]);
        const start = completed.findLastIndex(
          (message) => message.id === userMessage.id,
        );
        const toolNames = completed
          .slice(start + 1)
          .flatMap((message) =>
            message.parts.flatMap((part) =>
              part.type.startsWith("tool-") && allowedNames.has(part.type.slice(5))
                ? [part.type.slice(5)]
                : [],
            ),
          );
        // Operational metadata only. Never log messages, inputs, account pages or credentials.
        console.info(
          JSON.stringify({
            event: "city_agent_run",
            status: outcome.status,
            elapsedMs: Math.round(performance.now() - runStarted),
            tools: toolNames,
          }),
        );
        release();
      },
    });
  } catch (error) {
    release();
    return new Response(publicAIError(error), { status: 502 });
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return new Response("Cross-origin requests are disabled.", { status: 403 });
  const session = getSession(request.headers.get("cookie"), false);
  if (session?.busy)
    return new Response("Stop the active request before clearing this session.", {
      status: 409,
    });
  if (session) await removeSession(session);
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `toronto-one-agent=; HttpOnly; SameSite=Strict; Path=${appBasePath || "/"}; Max-Age=0`,
      "Cache-Control": "no-store",
    },
  });
}
