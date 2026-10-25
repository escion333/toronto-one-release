import test from "node:test";
import assert from "node:assert/strict";
import { generateText, isStepCount, jsonSchema, tool, wrapLanguageModel } from "ai";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import {
  createSpendMiddleware,
  modelSpendCeiling,
  recordModelSpend,
  reserveCostMicros,
  type SpendOperation,
} from "../src/lib/ai/spend.ts";
import { launchPolicy, launchStartedAt } from "../src/lib/ai/launch-policy.ts";

type CallParams = Parameters<MockLanguageModelV4["doGenerate"]>[0];
type ModelUsage = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>["usage"];
type StreamPart =
  Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<
    infer Part
  >
    ? Part
    : never;

const now = Date.parse(launchStartedAt) + 1000;
const params: CallParams = {
  prompt: [{ role: "user", content: [{ type: "text", text: "Fixture question 🍁" }] }],
  maxOutputTokens: 1800,
};
function usage(
  input: number | undefined = 100,
  output: number | undefined = 20,
): ModelUsage {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}
function generated(tokens = usage()) {
  return {
    content: [{ type: "text" as const, text: "Fixture answer" }],
    warnings: [],
    usage: tokens,
    finishReason: { unified: "stop" as const, raw: "stop" },
  };
}
function finished(tokens = usage()): StreamPart {
  return {
    type: "finish",
    usage: tokens,
    finishReason: { unified: "stop", raw: "stop" },
  };
}
function stream(parts: StreamPart[], close = true) {
  return new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      if (close) controller.close();
    },
  });
}
async function consume(readable: ReadableStream<StreamPart>) {
  const reader = readable.getReader();
  while (!(await reader.read()).done) {}
}
function fixture(options: ConstructorParameters<typeof MockLanguageModelV4>[0] = {}) {
  const calls: SpendOperation[] = [];
  const provider = new MockLanguageModelV4({
    modelId: modelSpendCeiling.model,
    ...options,
  });
  const model = wrapLanguageModel({
    model: provider,
    middleware: createSpendMiddleware({
      now: () => now,
      ledger: async (operation) => {
        calls.push(operation);
      },
    }),
  });
  return { provider, model, calls };
}

test("each generate call reserves before provider and settles conservative known usage", async () => {
  const { model, calls, provider } = fixture({ doGenerate: generated() });
  await model.doGenerate(params);
  await model.doGenerate(params);
  assert.equal(provider.doGenerateCalls.length, 2);
  assert.deepEqual(
    calls.map((entry) => entry.action),
    ["reserve-spend", "settle-spend", "reserve-spend", "settle-spend"],
  );
  assert.equal(calls[0]?.key, `spend-${launchPolicy(now).spendKey}`);
  assert.equal(
    calls[0]?.value.amountMicros,
    reserveCostMicros(params, modelSpendCeiling.model),
  );
  assert.equal(calls[1]?.value.amountMicros, 100 * 2.5 + 20 * 10);
  assert.equal(calls[0]?.value.id, calls[1]?.value.id);
  assert.notEqual(calls[0]?.value.id, calls[2]?.value.id);
  assert.equal(
    JSON.stringify(calls).includes("Fixture question"),
    false,
    "No prompts in ledger.",
  );
});

test("SDK tool-loop calls each reserve separately with serialized tool schemas and results", async () => {
  const { model, provider, calls } = fixture({
    doGenerate: [
      {
        ...generated(),
        content: [
          {
            type: "tool-call",
            toolCallId: "fixture-call",
            toolName: "lookup",
            input: "{}",
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
      },
      generated(),
    ],
  });
  await generateText({
    model,
    prompt: "Fixture lookup",
    maxOutputTokens: 1800,
    maxRetries: 0,
    stopWhen: isStepCount(3),
    tools: {
      lookup: tool({
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
        }),
        execute: async () => ({ checked: true }),
      }),
    },
  });
  assert.equal(provider.doGenerateCalls.length, 2);
  assert.deepEqual(
    calls.map((entry) => entry.action),
    ["reserve-spend", "settle-spend", "reserve-spend", "settle-spend"],
  );
  assert.ok((calls[2]?.value.amountMicros ?? 0) > (calls[0]?.value.amountMicros ?? 0));
});

test("budget denial blocks both provider methods even when SDK telemetry callbacks throw", async () => {
  const provider = new MockLanguageModelV4({
    modelId: modelSpendCeiling.model,
    doGenerate: generated(),
    doStream: { stream: stream([finished()]) },
  });
  const model = wrapLanguageModel({
    model: provider,
    middleware: createSpendMiddleware({
      ledger: async () => {
        throw new Error("Budget denied");
      },
    }),
  });
  await assert.rejects(
    generateText({
      model,
      prompt: "Fixture",
      maxOutputTokens: 1800,
      maxRetries: 0,
      onLanguageModelCallStart: () => {
        throw new Error("Telemetry swallowed");
      },
    }),
    /Budget denied/,
  );
  await assert.rejects(async () => await model.doStream(params), /Budget denied/);
  assert.equal(provider.doGenerateCalls.length, 0);
  assert.equal(provider.doStreamCalls.length, 0);
});

test("stream refunds only after a clean finish carrying complete known usage", async () => {
  const { model, calls } = fixture({ doStream: { stream: stream([finished()]) } });
  const result = await model.doStream(params);
  assert.deepEqual(
    calls.map((entry) => entry.action),
    ["reserve-spend"],
  );
  await consume(result.stream);
  assert.deepEqual(
    calls.map((entry) => entry.action),
    ["reserve-spend", "settle-spend"],
  );
  assert.equal(calls[1]?.value.amountMicros, 450);
});

test("standard settlement covers cache-write ceiling, rounds micros up and retains over-threshold holds", async () => {
  const odd = fixture({ doGenerate: generated(usage(101, 20)) });
  await odd.model.doGenerate(params);
  assert.equal(odd.calls[1]?.value.amountMicros, Math.ceil(101 * 2.5 + 20 * 10));
  const large: CallParams = {
    ...params,
    prompt: [{ role: "user", content: [{ type: "text", text: "a".repeat(239_000) }] }],
  };
  const boundary = fixture({ doGenerate: generated(usage(272_000, 1800)) });
  await boundary.model.doGenerate(large);
  assert.equal(boundary.calls[1]?.value.amountMicros, 272_000 * 2.5 + 1800 * 10);
  const long = fixture({ doGenerate: generated(usage(272_001, 1800)) });
  await long.model.doGenerate(large);
  assert.equal(
    long.calls.length,
    1,
    "Unexpected long-context usage retains its full hold.",
  );
  const outputOverrun = fixture({ doGenerate: generated(usage(100, 1801)) });
  await outputOverrun.model.doGenerate(params);
  assert.equal(outputOverrun.calls.length, 1);
});

test("unknown generate outcomes, unavailable usage and aborted calls retain the full hold", async () => {
  const failed = fixture({
    doGenerate: async () => {
      throw new Error("Unknown provider outcome");
    },
  });
  await assert.rejects(async () => await failed.model.doGenerate(params));
  assert.equal(failed.calls.length, 1);
  const missing = usage();
  missing.inputTokens.total = undefined;
  const noUsage = fixture({ doGenerate: generated(missing) });
  await noUsage.model.doGenerate(params);
  assert.equal(noUsage.calls.length, 1);
  const abort = new AbortController();
  const aborted = fixture({
    doGenerate: async () => {
      abort.abort();
      return generated();
    },
  });
  await aborted.model.doGenerate({ ...params, abortSignal: abort.signal });
  assert.equal(aborted.calls.length, 1);
  const impossible = fixture({ doGenerate: generated(usage(10_000_000, 20)) });
  await impossible.model.doGenerate(params);
  assert.equal(
    impossible.calls.length,
    1,
    "Usage exceeding a hold cannot authorize a refund.",
  );
});

test("provider stream failure, missing finish, error chunk and cancellation do not refund", async () => {
  const failed = fixture({
    doStream: async () => {
      throw new Error("Unknown stream outcome");
    },
  });
  await assert.rejects(async () => await failed.model.doStream(params));
  assert.equal(failed.calls.length, 1);
  const missing = usage();
  missing.outputTokens.total = undefined;
  for (const parts of [
    [],
    [finished(missing)],
    [{ type: "error" as const, error: "Fixture failure" }, finished()],
    [finished(), finished()],
  ]) {
    const current = fixture({ doStream: { stream: stream(parts) } });
    await consume((await current.model.doStream(params)).stream);
    assert.equal(current.calls.length, 1);
  }
  const cancelled = fixture({ doStream: { stream: stream([finished()], false) } });
  const reader = (await cancelled.model.doStream(params)).stream.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(
    cancelled.calls.length,
    1,
    "Even a finish chunk requires clean stream completion.",
  );
});

test("settlement failure is not retried and cannot invoke a second provider call", async () => {
  const provider = new MockLanguageModelV4({
    modelId: modelSpendCeiling.model,
    doGenerate: generated(),
  });
  const operations: SpendOperation[] = [];
  const model = wrapLanguageModel({
    model: provider,
    middleware: createSpendMiddleware({
      ledger: async (operation) => {
        operations.push(operation);
        if (operation.action === "settle-spend")
          throw new Error("Settlement unavailable");
      },
    }),
  });
  await assert.rejects(
    async () => await model.doGenerate(params),
    /Settlement unavailable/,
  );
  assert.equal(provider.doGenerateCalls.length, 1);
  assert.equal(operations.length, 2);
});

test("request bounds reject unpriced model/media/provider tools and oversized context before reserving", () => {
  assert.throws(() => reserveCostMicros(params, "unpriced/model"));
  for (const maxOutputTokens of [0, 1801, 1.5])
    assert.throws(() =>
      reserveCostMicros({ ...params, maxOutputTokens }, modelSpendCeiling.model),
    );
  assert.throws(() =>
    reserveCostMicros(
      {
        ...params,
        prompt: [
          { role: "user", content: [{ type: "text", text: "a".repeat(240_001) }] },
        ],
      },
      modelSpendCeiling.model,
    ),
  );
  assert.throws(() =>
    reserveCostMicros(
      { ...params, providerOptions: { openai: { previousResponseId: "fixture" } } },
      modelSpendCeiling.model,
    ),
  );
  assert.throws(() =>
    reserveCostMicros(
      {
        ...params,
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: { type: "url", url: new URL("https://example.com/image.png") },
                mediaType: "image/png",
              },
            ],
          },
        ],
      },
      modelSpendCeiling.model,
    ),
  );
  const byteBound = reserveCostMicros(params, modelSpendCeiling.model);
  assert.ok(byteBound > modelSpendCeiling.inputOverheadTokens * 4 + 1800 * 15);
});

test("production requires durable storage and no missing-token request reaches fetch", async () => {
  const names = ["NODE_ENV", "PRIVATE_STORE_URL", "PRIVATE_STORE_TOKEN"];
  const saved = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    process.env[names[0]!] = "production";
    const operation: SpendOperation = {
      action: "reserve-spend",
      key: `spend-${launchPolicy().spendKey}`,
      value: { id: "00112233-4455-4677-8899-aabbccddeeff", amountMicros: 1000 },
    };
    await assert.rejects(recordModelSpend(operation), /unavailable/);
    process.env[names[1]!] = "https://example.invalid/private";
    await assert.rejects(recordModelSpend(operation), /unavailable/);
  } finally {
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      if (!name) continue;
      const previous = saved[index];
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  }
});

test("development filesystem ledger serializes concurrent holds and persists each small record", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "toronto-one-spend-fixture-"));
  const names = ["NODE_ENV", "PRIVATE_STORE_URL", "PRIVATE_DATA_DIR"];
  const saved = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    process.env[names[0]!] = "development";
    process.env[names[2]!] = directory;
    const operations: SpendOperation[] = Array.from({ length: 12 }, (_, index) => ({
      action: "reserve-spend",
      key: `spend-${launchPolicy().spendKey}`,
      value: {
        id: `00112233-4455-4677-8899-${String(index).padStart(12, "0")}`,
        amountMicros: 1000,
      },
    }));
    await Promise.all(operations.map((operation) => recordModelSpend(operation)));
    const folder = path.join(directory, "ai-spend");
    assert.equal(readdirSync(folder).length, 13);
    const totals = () =>
      readdirSync(folder)
        .map((name) => {
          const value: unknown = JSON.parse(
            readFileSync(path.join(folder, name), "utf8"),
          );
          return value;
        })
        .filter((value) => typeof value === "number");
    assert.deepEqual(totals(), [12_000]);
    await Promise.all(
      operations.map((operation) =>
        recordModelSpend({
          ...operation,
          action: "settle-spend",
          value: { ...operation.value, amountMicros: 100 },
        }),
      ),
    );
    assert.deepEqual(totals(), [1200]);
  } finally {
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      if (!name) continue;
      const previous = saved[index];
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
