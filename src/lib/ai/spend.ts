import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { applyLedger, type LedgerStorage } from "./host-ledger.ts";
import { launchPolicy } from "./launch-policy.ts";

type Model = ReturnType<typeof wrapLanguageModel>;
type CallParams = Parameters<Model["doGenerate"]>[0];
type Usage = Awaited<ReturnType<Model["doGenerate"]>>["usage"];
type StreamPart =
  Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer Part>
    ? Part
    : never;

/** A conservative price ceiling, not provider billing or an exact dollar cap.
 * Valid only while this text-only model costs <= $4/M input and $15/M output.
 * Reserve at that ceiling. Completed standard-context usage settles all input
 * at $2.50/M (covers cache writes) and output at $10/M, ignoring cache discounts.
 * Unexpected long-context usage retains the hold; future price changes require
 * reviewing this fixed schedule.
 * Output totals include reasoning tokens. No provider-specific price overrides.
 */
export const modelSpendCeiling = {
  model: "openai/gpt-6.1-sol",
  inputMicrosPerToken: 4,
  outputMicrosPerToken: 15,
  standardInputMicrosPerToken: 2.5,
  standardOutputMicrosPerToken: 10,
  standardContextTokens: 272_000,
  maxRequestBytes: 240_000,
  inputOverheadTokens: 8192,
  maxOutputTokens: 1800,
} as const;

export type SpendOperation = {
  key: string;
  action: "reserve-spend" | "settle-spend";
  value: { id: string; amountMicros: number };
};
export type SpendLedger = (operation: SpendOperation) => Promise<void>;

const unavailable = () =>
  new Error("AI budget protection is temporarily unavailable. Please try again later.");

let localTransaction = Promise.resolve();

/** Development only, one process. Each small counter/UUID record is synced to
 * its own ignored file. Ledger write ordering retains holds on partial writes.
 */
async function localSpend(operation: SpendOperation) {
  const prior = localTransaction;
  let release = () => {};
  localTransaction = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prior;
  try {
    const directory = path.join(
      process.env.PRIVATE_DATA_DIR ?? path.join(process.cwd(), ".local", "booking"),
      "ai-spend",
    );
    const filename = (key: string) =>
      path.join(directory, `${createHash("sha256").update(key).digest("hex")}.json`);
    const storage: LedgerStorage = {
      async get(key) {
        try {
          const value: unknown = JSON.parse(readFileSync(filename(key), "utf8"));
          return value;
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT")
            return undefined;
          throw unavailable();
        }
      },
      async put(key, value) {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const target = filename(key);
        const temporary = `${target}.${randomUUID()}.tmp`;
        const descriptor = openSync(temporary, "wx", 0o600);
        try {
          writeFileSync(descriptor, JSON.stringify(value));
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        renameSync(temporary, target);
      },
    };
    const response = await applyLedger(storage, operation);
    if (!response.ok) throw ledgerFailure(response.status);
  } finally {
    release();
  }
}

function ledgerFailure(status: number) {
  return status === 429
    ? new Error("The public AI allowance has been reached. Please come back later.")
    : unavailable();
}

/** No retries: a timed-out reservation/settlement may already be durable. */
export const recordModelSpend: SpendLedger = async (operation) => {
  const endpoint = process.env.PRIVATE_STORE_URL;
  if (!endpoint) {
    if (process.env.NODE_ENV === "production") throw unavailable();
    return localSpend(operation);
  }
  const token = process.env.PRIVATE_STORE_TOKEN;
  if (!token) throw unavailable();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(operation),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
  } catch {
    throw unavailable();
  }
  if (!response.ok) throw ledgerFailure(response.status);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw unavailable();
  }
  if (!(typeof data === "object" && data !== null && "ok" in data && data.ok === true))
    throw unavailable();
};

/** UTF-8 bytes upper-bound text tokens; allow extra provider framing overhead.
 * Media, provider tools, remote response references and unpriced model/options
 * are excluded: their costs cannot be bounded by serialized text bytes.
 */
export function reserveCostMicros(params: CallParams, modelId: string) {
  if (
    modelId !== modelSpendCeiling.model ||
    !Number.isSafeInteger(params.maxOutputTokens) ||
    params.maxOutputTokens === undefined ||
    params.maxOutputTokens < 1 ||
    params.maxOutputTokens > modelSpendCeiling.maxOutputTokens ||
    (params.providerOptions && Object.keys(params.providerOptions).length > 0) ||
    params.tools?.some((entry) => entry.type !== "function")
  )
    throw new Error("This model call is outside the configured AI budget protection.");
  for (const message of params.prompt) {
    if (typeof message.content === "string") continue;
    for (const part of message.content) {
      if (
        ![
          "text",
          "reasoning",
          "tool-call",
          "tool-result",
          "tool-approval-response",
        ].includes(part.type) ||
        (part.type === "tool-call" && part.providerExecuted) ||
        (part.type === "tool-result" &&
          !["text", "json", "error-text", "error-json", "execution-denied"].includes(
            part.output.type,
          ))
      )
        throw new Error("This content is outside the configured AI budget protection.");
    }
  }
  const bytes = Buffer.byteLength(
    JSON.stringify({
      prompt: params.prompt,
      tools: params.tools,
      responseFormat: params.responseFormat,
      toolChoice: params.toolChoice,
    }),
    "utf8",
  );
  if (bytes > modelSpendCeiling.maxRequestBytes)
    throw new Error(
      "This conversation has reached its context limit. Please start a new visit.",
    );
  return (
    (bytes + modelSpendCeiling.inputOverheadTokens) *
      modelSpendCeiling.inputMicrosPerToken +
    params.maxOutputTokens * modelSpendCeiling.outputMicrosPerToken
  );
}

function knownCostMicros(usage: Usage, heldMicros: number) {
  const input = usage.inputTokens.total;
  const output = usage.outputTokens.total;
  if (
    input === undefined ||
    output === undefined ||
    !Number.isSafeInteger(input) ||
    !Number.isSafeInteger(output) ||
    input < 0 ||
    input > modelSpendCeiling.standardContextTokens ||
    output < 0 ||
    output > modelSpendCeiling.maxOutputTokens
  )
    return;
  const actual = Math.ceil(
    input * modelSpendCeiling.standardInputMicrosPerToken +
      output * modelSpendCeiling.standardOutputMicrosPerToken,
  );
  return Number.isSafeInteger(actual) && actual <= heldMicros ? actual : undefined;
}

/** SDK telemetry callbacks swallow errors; these wrappers gate the actual
 * provider invocation, once per loop step, with maxRetries=0 at the caller.
 */
export function createSpendMiddleware({
  ledger = recordModelSpend,
  now = Date.now,
  id = randomUUID,
}: {
  ledger?: SpendLedger;
  now?: () => number;
  id?: () => string;
} = {}): LanguageModelMiddleware {
  async function reserve(params: CallParams, modelId: string) {
    const heldMicros = reserveCostMicros(params, modelId);
    const operation: SpendOperation = {
      key: `spend-${launchPolicy(now()).spendKey}`,
      action: "reserve-spend",
      value: { id: id(), amountMicros: heldMicros },
    };
    await ledger(operation);
    return { operation, heldMicros };
  }
  async function settle(
    hold: Awaited<ReturnType<typeof reserve>>,
    usage: Usage,
    reason: string,
    params: CallParams,
  ) {
    if (
      params.abortSignal?.aborted ||
      ["error", "interrupted", "other"].includes(reason)
    )
      return;
    const actual = knownCostMicros(usage, hold.heldMicros);
    if (actual === undefined) return;
    // Failure retains the original durable hold. Never retry an unknown refund.
    await ledger({
      key: hold.operation.key,
      action: "settle-spend",
      value: { id: hold.operation.value.id, amountMicros: actual },
    });
  }
  return {
    specificationVersion: "v4",
    async wrapGenerate({ doGenerate, params, model }) {
      params.abortSignal?.throwIfAborted();
      const hold = await reserve(params, model.modelId);
      params.abortSignal?.throwIfAborted();
      const result = await doGenerate();
      await settle(hold, result.usage, result.finishReason.unified, params);
      return result;
    },
    async wrapStream({ doStream, params, model }) {
      params.abortSignal?.throwIfAborted();
      const hold = await reserve(params, model.modelId);
      params.abortSignal?.throwIfAborted();
      const result = await doStream();
      let finish: Extract<StreamPart, { type: "finish" }> | undefined;
      let uncertain = false;
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream<StreamPart, StreamPart>({
            transform(chunk, controller) {
              if (chunk.type === "error") uncertain = true;
              if (chunk.type === "finish") {
                if (finish) uncertain = true;
                finish = chunk;
              }
              controller.enqueue(chunk);
            },
            async flush() {
              if (finish && !uncertain)
                await settle(hold, finish.usage, finish.finishReason.unified, params);
            },
          }),
        ),
      };
    },
  };
}
