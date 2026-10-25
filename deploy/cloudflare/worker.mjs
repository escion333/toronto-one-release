import { DurableObject } from "cloudflare:workers";
import { keepAwakeSettings, maintainWarmth } from "./keep-awake.ts";
import { applyLedger } from "../../src/lib/ai/host-ledger.ts";

const prefix = "/toronto-one";
export class TorontoOne extends DurableObject {
  starting;

  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(() => maintainWarmth(ctx, env.KEEP_AWAKE_UNTIL));
  }

  ensureStarted() {
    this.starting ??= this.start().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  async hostingStatus() {
    await this.ensureStarted();
    const running = await this.ctx.container.inspect();
    const settings = keepAwakeSettings(this.env.KEEP_AWAKE_UNTIL);
    const alarm = await this.ctx.storage.getAlarm();
    return {
      ok: true,
      keepAwakeUntil: settings.active ? this.env.KEEP_AWAKE_UNTIL : null,
      nextWarmAlarm: alarm === null ? null : new Date(alarm).toISOString(),
      runningImage: running?.image ?? null,
      configuredImage: this.ctx.container.images.base,
    };
  }

  async alarm() {
    const settings = keepAwakeSettings(this.env.KEEP_AWAKE_UNTIL);
    if (!settings.active) {
      await maintainWarmth(this.ctx, this.env.KEEP_AWAKE_UNTIL);
      return;
    }
    // Schedule recovery before probing the server, so failures cannot end renewal.
    await this.ctx.storage.setAlarm(settings.nextAlarmAt);
    await this.ensureStarted();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === `${prefix}/_private/store`) return this.ledger(request);
    await this.ensureStarted();
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    const response = await this.ctx.container.getTcpPort(8080).fetch(forwarded);
    if (url.pathname === `${prefix}/api/health`) {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      const settings = keepAwakeSettings(this.env.KEEP_AWAKE_UNTIL);
      headers.set(
        "X-Toronto-One-Keep-Awake-Until",
        settings.active ? this.env.KEEP_AWAKE_UNTIL : "disabled",
      );
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm !== null)
        headers.set("X-Toronto-One-Next-Warm-Alarm", new Date(alarm).toISOString());
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  }

  async ledger(request) {
    if (
      request.method !== "POST" ||
      !this.env.PRIVATE_STORE_TOKEN ||
      request.headers.get("authorization") !== `Bearer ${this.env.PRIVATE_STORE_TOKEN}`
    )
      return new Response("Not found", { status: 404 });
    const text = await request.text();
    if (text.length > 8000) return new Response("Too large", { status: 413 });
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      return new Response("Invalid input", { status: 400 });
    }
    return this.ctx.storage.transaction((storage) =>
      applyLedger(storage, input, Number(this.env.DEMO_DAILY_TURNS ?? 50)),
    );
  }

  async start() {
    const container = this.ctx.container;
    const configuredImage = container.images.base;
    const running = await container.inspect();
    if (running?.image && running.image !== configuredImage) await container.destroy();
    if (!container.running)
      container.start({
        image: configuredImage,
        instance: { vcpu: 0.5, memoryMib: 2048, diskMb: 6144 },
        enableInternet: true,
        env: {
          AI_GATEWAY_API_KEY: this.env.AI_GATEWAY_API_KEY ?? "",
          AI_GATEWAY_MODEL: this.env.AI_GATEWAY_MODEL ?? "openai/gpt-6.1-sol",
          PUBLIC_ORIGIN: "https://www.tomsanee.com",
          REMOTE_CITY_BROWSER: "true",
          DEMO_MAX_SESSIONS: "4",
          DEMO_MAX_CONCURRENT_RUNS: "2",
          DEMO_DAILY_TURNS: String(this.env.DEMO_DAILY_TURNS ?? 50),
          PRIVATE_STORE_URL: "https://www.tomsanee.com/toronto-one/_private/store",
          PRIVATE_STORE_TOKEN: this.env.PRIVATE_STORE_TOKEN ?? "",
        },
      });
    await maintainWarmth(this.ctx, this.env.KEEP_AWAKE_UNTIL);
    const port = container.getTcpPort(8080);
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch("http://container/toronto-one/api/health", {
          signal: AbortSignal.timeout(1000),
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        /* A cold container can take several seconds to boot. */
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Application startup did not finish.");
  }
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "tomsanee.com") {
      url.hostname = "www.tomsanee.com";
      return Response.redirect(url.href, 308);
    }
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))
      return new Response("Not found", { status: 404 });
    try {
      const app = env.APP.getByName("public-v1");
      if (url.pathname === `${prefix}/api/health`) {
        const status = await app.hostingStatus();
        return Response.json(status, {
          headers: {
            "Cache-Control": "no-store",
            "X-Toronto-One-Keep-Awake-Until": status.keepAwakeUntil ?? "disabled",
            ...(status.nextWarmAlarm
              ? { "X-Toronto-One-Next-Warm-Alarm": status.nextWarmAlarm }
              : {}),
          },
        });
      }
      return await app.fetch(request);
    } catch {
      return new Response(
        "Toronto One is waking up or temporarily unavailable. Please try again shortly.",
        { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } },
      );
    }
  },
};

export default worker;
