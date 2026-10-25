"use client";
import { appPath } from "@/lib/app-path";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { useEffect, useState } from "react";
import type { CityUIMessage } from "@/lib/ai/agent";
import {
  agentMascotState,
  cityResultSchema,
  type CityResult,
} from "@/lib/ai/contracts";
import { z } from "zod";
import { bookingMascotState } from "@/lib/ai/booking-contracts";
import { useRecreationBooking } from "./use-recreation-booking";

const transport = new DefaultChatTransport<CityUIMessage>({
  api: appPath("/api/chat"),
  prepareSendMessagesRequest: ({ messages }) => {
    const latest = messages.findLast((m) => m.role === "user");
    return {
      body: {
        message: {
          id: latest?.id,
          text:
            latest?.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("\n") ?? "",
        },
      },
    };
  },
});
export function useCityAgent() {
  const booking = useRecreationBooking();
  const chat = useChat<CityUIMessage>({ id: "toronto-one-concierge", transport });
  const { setMessages } = chat;
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [retainedResults, setRetainedResults] = useState<CityResult[]>([]);
  const [configuration, setConfiguration] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(appPath("/api/chat"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not restore this session’s findings.");
        const value: unknown = await response.json();
        return z
          .object({
            messages: z.array(z.custom<CityUIMessage>()).optional(),
            results: z.array(cityResultSchema),
          })
          .parse(value);
      })
      .then(({ messages, results }) => {
        setRetainedResults(results);
        if (messages?.length)
          setMessages((current) => (current.length ? current : messages));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLocalError(
            "Could not restore this session’s findings. Reload to try again.",
          );
      });
    void fetch(appPath("/api/status"), { signal: controller.signal })
      .then((r) => r.json())
      .then((value: unknown) => {
        if (
          typeof value === "object" &&
          value !== null &&
          "configured" in value &&
          typeof value.configured === "boolean" &&
          "model" in value &&
          typeof value.model === "string"
        )
          setConfiguration({ configured: value.configured, model: value.model });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [setMessages]);
  const latest = chat.messages.findLast((m) => m.role === "assistant");
  const toolParts = latest?.parts.filter(isToolUIPart) ?? [];
  const lastTool = toolParts.at(-1);
  const liveResults = chat.messages.flatMap((m) =>
    m.parts.flatMap((p) =>
      p.type === "tool-publishResult" && p.state === "output-available"
        ? [p.output]
        : [],
    ),
  );
  const results = [
    ...new Map(
      [...liveResults, ...retainedResults].map((result) => [result.id, result]),
    ).values(),
  ];
  const mascot = agentMascotState({
    status: chat.status,
    focused,
    toolRunning: toolParts.some((p) => p.state === "input-available"),
    needsInput:
      lastTool?.type === "tool-requestResidentInput" &&
      lastTool.state === "output-available",
    hasResult: toolParts.some(
      (p) => p.type === "tool-publishResult" && p.state === "output-available",
    ),
    toolFailed: Boolean(
      localError ||
      stopped ||
      (toolParts.some((part) => part.state === "output-error") &&
        !toolParts.some(
          (part) =>
            part.type === "tool-publishResult" && part.state === "output-available",
        ) &&
        lastTool?.type !== "tool-requestResidentInput"),
    ),
  });
  async function send(text: string) {
    if (!text.trim()) return;
    setLocalError(null);
    setStopped(false);
    setFocused(false);
    try {
      await chat.sendMessage({ text: text.trim() });
    } catch {
      /* useChat owns transport errors. */
    }
  }
  async function clear() {
    const response = await fetch(appPath("/api/chat"), { method: "DELETE" });
    if (!response.ok) {
      setLocalError(await response.text());
      return false;
    }
    chat.setMessages([]);
    setRetainedResults([]);
    chat.clearError();
    setLocalError(null);
    setStopped(false);
    return true;
  }
  return {
    ...chat,
    send,
    clear,
    results,
    recordHandoff: (id: string, handoff: { url: string; checkedAt: string }) => {
      const result = results.find((result) => result.id === id);
      if (result)
        setRetainedResults((previous) => [
          ...previous.filter((result) => result.id !== id),
          { ...result, handoff },
        ]);
    },
    booking,
    mascot: bookingMascotState({
      base: mascot,
      status: booking.state?.status,
      busy: booking.busy,
      error: Boolean(booking.error),
      activeChat: chat.status === "submitted" || chat.status === "streaming",
      focused,
    }),
    setFocused,
    configuration,
    errorMessage:
      localError ||
      chat.error?.message ||
      (stopped
        ? "Conversation stopped. Check Tasks for any booking already sent; stopping chat does not cancel a City reservation."
        : null),
    stopRequest: () => {
      void chat.stop();
      setStopped(true);
    },
    retry: () => {
      const last = chat.messages.findLast((m) => m.role === "user");
      if (last) {
        setStopped(false);
        setLocalError(null);
        chat.clearError();
        void chat.regenerate().catch(() => undefined);
      }
    },
  };
}
