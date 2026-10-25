import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import ts from "typescript";
import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = "escion333/toronto-one-release";
const workflow = "build-image.yml";
const configPath = resolve(root, "deploy/cloudflare/wrangler.jsonc");
const secretNames = ["CF_UI_REGISTRY_USER", "CF_UI_REGISTRY_PASSWORD"];
const imagePattern =
  /^registry\.cloudflare\.com\/[a-f0-9]{32}\/toronto-one-remote@sha256:[a-f0-9]{64}$/;
const configSchema = z
  .object({
    main: z.string(),
    containers: z
      .array(
        z
          .object({
            images: z
              .object({ base: z.object({ image: z.string() }).strict() })
              .strict(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
const runSchema = z.object({
  databaseId: z.number(),
  displayTitle: z.string(),
  status: z.string(),
});

export function deploymentConfig(value: unknown, image?: string) {
  const config = configSchema.parse(value);
  const container = config.containers[0];
  if (!container) throw new Error("Expected one deployment container.");
  const reference = image ?? container.images.base.image;
  if (!imagePattern.test(reference))
    throw new Error(
      "Deployment requires an immutable, prebuilt Cloudflare image. Local Docker builds are disabled.",
    );
  container.images.base.image = reference;
  return config;
}

export function imageFromLogs(logs: string, expectedImage: string) {
  const references = new Set(
    logs.match(
      /registry\.cloudflare\.com\/[a-f0-9]{32}\/toronto-one-remote@sha256:[a-f0-9]{64}/g,
    ),
  );
  if (references.size !== 1)
    throw new Error("Remote build did not report exactly one immutable image.");
  const [reference] = references;
  if (!reference || reference.split("@")[0] !== expectedImage.split("@")[0])
    throw new Error("Remote build reported an unexpected image repository.");
  return reference;
}

export function healthMatches(value: unknown, image: string) {
  const health = z
    .object({
      ok: z.literal(true),
      runningImage: z.literal(image),
      configuredImage: z.literal(image),
    })
    .safeParse(value);
  return health.success;
}

function command(
  program: string,
  args: string[],
  options: { input?: string; inherit?: boolean; env?: NodeJS.ProcessEnv } = {},
) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: options.inherit ? "inherit" : "pipe",
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${program} ${args.slice(0, 2).join(" ")} failed. ${options.inherit ? "See the output above." : "Check authentication and command access."}`,
    );
  return result.stdout ?? "";
}

function gh(args: string[]) {
  return command("gh", [...args, "--repo", repo]);
}

async function main() {
  const configText = await readFile(configPath, "utf8");
  const parsed = ts.parseConfigFileTextToJson(configPath, configText);
  if (parsed.error) throw new Error("The deployment configuration is invalid.");
  const rawConfig: unknown = parsed.config;
  const config = deploymentConfig(rawConfig);
  const currentImage = config.containers[0]?.images.base.image;
  if (!currentImage) throw new Error("Missing prebuilt image.");
  if (configText.split(currentImage).length !== 2)
    throw new Error(
      "The canonical image pin must occur exactly once in the configuration.",
    );
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length === 1 && !["--check", "--build-only"].includes(args[0] ?? ""))
  )
    throw new Error("Usage: pnpm run deploy, pnpm check, or pnpm deploy:check");
  if (args[0] === "--check") {
    console.log(
      "Deployment config uses a pinned remote image. pnpm run deploy builds on GitHub; local Docker is disabled.",
    );
    return;
  }
  if (command("git", ["status", "--porcelain"]).trim())
    throw new Error(
      "Commit the intended changes and push them to origin before deploying. Uncommitted files are never uploaded.",
    );
  const origin = command("git", ["remote", "get-url", "origin"]).trim();
  if (
    !/^https:\/\/github\.com\/escion333\/toronto-one-release(?:\.git)?$/.test(origin) &&
    origin !== "git@github.com:escion333/toronto-one-release.git"
  )
    throw new Error("Deploy only from the canonical release repository.");
  const source = command("git", ["rev-parse", "HEAD"]).trim();
  if (!/^[a-f0-9]{40}$/.test(source))
    throw new Error("Expected a committed source revision.");
  const published = command("gh", [
    "api",
    `repos/${repo}/commits/${source}`,
    "--jq",
    ".sha",
  ]).trim();
  if (published !== source)
    throw new Error("Push this commit to origin before deploying.");
  const active = runSchema
    .array()
    .parse(
      JSON.parse(
        gh([
          "run",
          "list",
          "--workflow",
          workflow,
          "--limit",
          "20",
          "--json",
          "databaseId,displayTitle,status",
        ]),
      ),
    );
  if (active.some((run) => run.status !== "completed"))
    throw new Error(
      "A remote image build is already active. Wait for it to finish before deploying.",
    );
  const existing = z
    .array(z.object({ name: z.string() }))
    .parse(JSON.parse(gh(["secret", "list", "--json", "name"])));
  if (existing.some((secret) => secretNames.includes(secret.name)))
    throw new Error(
      "Temporary build credentials already exist. Reconcile the previous deployment before retrying.",
    );

  const configuredSecrets: string[] = [];
  let image: string;
  try {
    console.log(
      "Creating temporary registry credentials; application secrets remain in Cloudflare.",
    );
    const credentials = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(
        JSON.parse(
          command("pnpm", [
            "exec",
            "wrangler",
            "containers",
            "registries",
            "credentials",
            "--push",
            "--pull",
            "--expiration-minutes",
            "60",
            "--json",
            "--config",
            configPath,
          ]),
        ),
      );
    for (const [name, value] of [
      [secretNames[0], credentials.username],
      [secretNames[1], credentials.password],
    ]) {
      if (!name || !value)
        throw new Error("Incomplete temporary registry credentials.");
      command("gh", ["secret", "set", name, "--repo", repo], { input: value });
      configuredSecrets.push(name);
    }
    const releaseId = randomUUID();
    gh([
      "workflow",
      "run",
      workflow,
      "--ref",
      "main",
      "--raw-field",
      `source_ref=${source}`,
      "--raw-field",
      `release_id=${releaseId}`,
    ]);
    console.log(
      "Remote checks and image build requested on GitHub. Docker stays off locally.",
    );
    let runId: number | undefined;
    for (let attempt = 0; attempt < 24; attempt++) {
      const runs = runSchema
        .array()
        .parse(
          JSON.parse(
            gh([
              "run",
              "list",
              "--workflow",
              workflow,
              "--event",
              "workflow_dispatch",
              "--limit",
              "20",
              "--json",
              "databaseId,displayTitle,status",
            ]),
          ),
        );
      runId = runs.find(
        (run) => run.displayTitle === `Remote image ${releaseId}`,
      )?.databaseId;
      if (runId !== undefined) break;
      await delay(5000);
    }
    if (runId === undefined)
      throw new Error(
        "Could not identify the dispatched build. Check GitHub Actions before retrying.",
      );
    console.log(`Build: https://github.com/${repo}/actions/runs/${runId}`);
    command(
      "gh",
      [
        "run",
        "watch",
        String(runId),
        "--repo",
        repo,
        "--interval",
        "20",
        "--exit-status",
      ],
      { inherit: true },
    );
    image = imageFromLogs(gh(["run", "view", String(runId), "--log"]), currentImage);
  } finally {
    const failures: string[] = [];
    for (const name of configuredSecrets) {
      try {
        gh(["secret", "delete", name]);
      } catch {
        failures.push(name);
      }
    }
    if (failures.length)
      throw new Error(
        `Remove remaining temporary GitHub secrets before continuing: ${failures.join(", ")}`,
      );
    if (configuredSecrets.length)
      console.log("Temporary GitHub registry credentials removed.");
  }

  if (args[0] === "--build-only") {
    console.log(`Remote checks passed. Built ${image}. Nothing was deployed.`);
    return;
  }

  const nextConfig = deploymentConfig(rawConfig, image);
  const privateDir = resolve(dirname(configPath), ".wrangler");
  const privateConfig = resolve(privateDir, "remote-release.jsonc");
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  await writeFile(
    privateConfig,
    JSON.stringify(
      { ...nextConfig, main: resolve(dirname(configPath), nextConfig.main) },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(`Deploying prebuilt image ${image}`);
  command("pnpm", ["exec", "wrangler", "deploy", "--config", privateConfig], {
    inherit: true,
    env: { ...process.env, WRANGLER_DOCKER_BIN: "/usr/bin/false" },
  });
  for (let attempt = 0; attempt < 12; attempt++) {
    let healthy = false;
    try {
      const response = await fetch("https://www.tomsanee.com/toronto-one/api/health", {
        signal: AbortSignal.timeout(15000),
      });
      const value: unknown = await response.json();
      healthy = response.ok && healthMatches(value, image);
    } catch {
      /* Allow the deployed image to start; do not redeploy it. */
    }
    if (healthy) {
      if ((await readFile(configPath, "utf8")) !== configText)
        throw new Error(
          "Live image verified, but the deployment config changed during the run. Reconcile its image pin without overwriting those edits.",
        );
      await writeFile(configPath, configText.replace(currentImage, image));
      console.log(
        "Live image verified. Include the updated Wrangler image pin in your next commit.",
      );
      return;
    }
    await delay(5000);
  }
  throw new Error(
    `Deployment was submitted but health verification timed out. Reconcile the live image before deploying again. Expected: ${image}`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Remote deployment failed.");
    process.exitCode = 1;
  });
}
