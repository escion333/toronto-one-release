import { reserveRun } from "@/lib/ai/limits";
import { randomUUID } from "node:crypto";
import { appBasePath } from "@/lib/app-path";
import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { AdmissionError } from "@/lib/ai/run-queue";
import { z } from "zod";
import { createCityAgent, gatewayConfigured } from "@/lib/ai/agent";
import { aiFailureCode, publicAIError } from "@/lib/ai/errors";
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
  // Claim ownership synchronously, including while waiting for an execution slot.
  session.busy = true;
  const stop = new AbortController();
  const signal = AbortSignal.any([request.signal, stop.signal]);
  let releaseUsage: (() => void) | undefined;
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      // Each visitor keeps their own evidence and messages, never an idle Chromium page.
      await session.browser.close();
    } finally {
      releaseUsage?.();
      session.busy = false;
      session.touchedAt = Date.now();
    }
  };
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
  const runStarted = performance.now();
  const requestId = randomUUID();
  const reportError = (error: unknown) => {
    // Fixed codes only: no prompts, provider response bodies or private evidence.
    console.warn(
      JSON.stringify({
        event: "city_agent_error",
        requestId,
        code: error instanceof AdmissionError ? "admission" : aiFailureCode(error),
        elapsedMs: Math.round(performance.now() - runStarted),
      }),
    );
    return error instanceof AdmissionError ? error.message : publicAIError(error);
  };
  const stream = createUIMessageStream({
    onEnd: ({ isCancelled, isAborted }) => {
      if (isCancelled || isAborted) stop.abort();
    },
    onError: reportError,
    execute: async ({ writer }) => {
      try {
        releaseUsage = await reserveRun(session.id, signal);
        signal.throwIfAborted();
        session.messages = messages;
        writer.merge(
          await createAgentUIStream({
            agent: createCityAgent(session),
            uiMessages: messages,
            generateMessageId: randomUUID,
            abortSignal: signal,
            timeout: { totalMs: 180_000 },
            sendReasoning: false,
            onError: reportError,
            onEnd: async ({ messages: completed, isAborted, isCancelled, outcome }) => {
              if (!isAborted && !isCancelled && outcome.status === "completed")
                session.messages = completed;
              const allowedNames = new Set([
                "recreationBookingStatus",
                "prepareRecreationBooking",
                "recreationSearch",
                "searchTennisCourts",
                "recreationServiceGuide",
                "prepareTennisReservation",
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
                    part.type.startsWith("tool-") &&
                    allowedNames.has(part.type.slice(5))
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
              await release();
            },
          }),
        );
      } catch (error) {
        await release();
        throw error;
      }
    },
  });
  return createUIMessageStreamResponse({
    stream,
    keepAliveMs: 15_000,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie(
        session,
        process.env.PUBLIC_ORIGIN?.startsWith("https:") ||
          new URL(request.url).protocol === "https:",
      ),
    },
  });
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
