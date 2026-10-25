import test from "node:test";
import assert from "node:assert/strict";
import {
  generateText,
  isStepCount,
  jsonSchema,
  ToolLoopAgent,
  tool,
  wrapLanguageModel,
  type ModelMessage,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { cityModelMessages } from "../src/lib/ai/context.ts";
import { AIRequestError, aiFailureCode, publicAIError } from "../src/lib/ai/errors.ts";
import { createSpendMiddleware, modelSpendCeiling } from "../src/lib/ai/spend.ts";

function pageMessages(id: string): ModelMessage[] {
  return [
    {
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: id, toolName: "browserOpen", input: {} },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: id,
          toolName: "browserOpen",
          output: {
            type: "json",
            value: {
              id,
              url: `https://www.toronto.ca/explore-enjoy/parks-recreation/${id}/`,
              text: "a".repeat(66_000),
            },
          },
        },
      ],
    },
  ];
}

test("large directory history fits the spend guard while keeping current evidence and resident choices", async () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "Reserve a tennis court near King and Bathurst." },
    ...pageMessages("old-1"),
    ...pageMessages("old-2"),
    ...pageMessages("old-3"),
    { role: "assistant", content: "Should I widen the area?" },
    { role: "user", content: "Widen the area" },
    ...pageMessages("current"),
  ];
  const original = structuredClone(messages);
  const provider = new MockLanguageModelV4({
    modelId: modelSpendCeiling.model,
    doGenerate: {
      content: [{ type: "text", text: "Fixture answer" }],
      warnings: [],
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 20, text: 20, reasoning: 0 },
      },
      finishReason: { unified: "stop", raw: "stop" },
    },
  });
  const model = wrapLanguageModel({
    model: provider,
    middleware: createSpendMiddleware({ ledger: async () => {} }),
  });
  await assert.rejects(
    generateText({ model, messages, maxOutputTokens: 1800, maxRetries: 0 }),
    (error) => error instanceof AIRequestError && error.code === "context_limit",
  );
  assert.equal(provider.doGenerateCalls.length, 0);
  const compact = cityModelMessages(messages);
  await generateText({
    model,
    messages: compact,
    maxOutputTokens: 1800,
    maxRetries: 0,
  });
  assert.equal(provider.doGenerateCalls.length, 1);
  assert.deepEqual(compact.slice(-2), messages.slice(-2));
  assert.ok(JSON.stringify(compact).includes("Widen the area"));
  assert.ok(JSON.stringify(compact).includes("King and Bathurst"));
  assert.ok(
    JSON.stringify(compact).includes("old-1"),
    "Keep navigation history to prevent repeated searches.",
  );
  assert.ok(JSON.stringify(compact).includes('"contentOmitted":true'));
  assert.deepEqual(messages, original, "UI history and evidence must not be mutated.");
});

test("compaction preserves navigation pairs, cards, citations and booking progress", () => {
  const names = [
    "publishResult",
    "citeSource",
    "recreationBookingStatus",
    "requestResidentInput",
  ];
  const retained: ModelMessage[] = names.flatMap((toolName) => [
    {
      role: "assistant" as const,
      content: [
        { type: "tool-call" as const, toolCallId: toolName, toolName, input: {} },
      ],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: toolName,
          toolName,
          output: { type: "json" as const, value: { fixture: toolName } },
        },
      ],
    },
  ]);
  const messages = [...pageMessages("old"), ...retained, ...pageMessages("new")];
  const compact = cityModelMessages(messages);
  assert.equal(compact.length, messages.length);
  assert.deepEqual(compact.slice(2), [...retained, ...pageMessages("new")]);
  assert.deepEqual(compact[0], messages[0]);
  assert.ok(JSON.stringify(compact[1]).includes('"contentOmitted":true'));
});

test("SDK multi-step directory discovery stays bounded before every provider call", async () => {
  let step = 0;
  const provider = new MockLanguageModelV4({
    modelId: modelSpendCeiling.model,
    doGenerate: async () => {
      const last = step === 6;
      return {
        content: last
          ? [{ type: "text" as const, text: "Fixture discovery complete." }]
          : [
              {
                type: "tool-call" as const,
                toolCallId: `page-${step++}`,
                toolName: "browserOpen",
                input: "{}",
              },
            ],
        warnings: [],
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 20, text: 20, reasoning: 0 },
        },
        finishReason: last
          ? { unified: "stop" as const, raw: "stop" }
          : { unified: "tool-calls" as const, raw: "tool_calls" },
      };
    },
  });
  const agent = new ToolLoopAgent({
    model: wrapLanguageModel({
      model: provider,
      middleware: createSpendMiddleware({ ledger: async () => {} }),
    }),
    maxOutputTokens: 1800,
    maxRetries: 0,
    stopWhen: isStepCount(8),
    prepareStep: ({ messages }) => ({ messages: cityModelMessages(messages) }),
    tools: {
      browserOpen: tool({
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
        }),
        execute: async () => ({ text: "a".repeat(66_000) }),
      }),
    },
  });
  const result = await agent.generate({ prompt: "Fixture discovery; never book." });
  assert.equal(result.text, "Fixture discovery complete.");
  assert.equal(provider.doGenerateCalls.length, 7);
  assert.ok(
    provider.doGenerateCalls.every(
      (call) => Buffer.byteLength(JSON.stringify(call.prompt)) < 140_000,
    ),
  );
});

test("local request failures retain their reason without provider details or false submission assurances", () => {
  for (const code of [
    "context_limit",
    "budget_unavailable",
    "budget_exhausted",
    "unsupported_call",
  ] as const) {
    const error = new AIRequestError(code);
    assert.equal(publicAIError(error), error.message);
    assert.doesNotMatch(publicAIError(error), /Gateway|no booking was submitted/i);
  }
  assert.match(publicAIError(new AIRequestError("context_limit")), /too large/);
  const wrapped = new Error("Private provider details", {
    cause: new AIRequestError("context_limit"),
  });
  assert.match(publicAIError(wrapped), /too large/);
  assert.equal(aiFailureCode(wrapped), "context_limit");
  assert.equal(aiFailureCode(new Error("Private provider details")), "unknown");
  assert.equal(
    aiFailureCode({ statusCode: 503, message: "Private details" }),
    "upstream_503",
  );
  assert.doesNotMatch(
    publicAIError(new Error("private fixture")),
    /private fixture|Gateway|no booking was submitted/i,
  );
});
