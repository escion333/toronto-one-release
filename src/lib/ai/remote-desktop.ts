import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

export type ResidentDesktop = {
  display: string;
  uid: number;
  home: string;
  port: number;
  expiresAt: number;
  interactive: boolean;
  children: ChildProcess[];
};
const shared = globalThis as typeof globalThis & {
  torontoOneDesktops?: Map<string, ResidentDesktop>;
  torontoOneNextGuestUid?: number;
};
export const residentDesktops = (shared.torontoOneDesktops ??= new Map<
  string,
  ResidentDesktop
>());

export function authorizeResidentDesktop(
  cookie: string | undefined,
  origin: string | undefined,
  expectedOrigin: string,
  registry = residentDesktops,
  now = Date.now(),
) {
  if (origin !== expectedOrigin) return undefined;
  const owner = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("toronto-one-agent="))
    ?.slice("toronto-one-agent=".length);
  const desktop = owner ? registry.get(owner) : undefined;
  return owner && desktop?.interactive && desktop.expiresAt > now
    ? { owner, desktop }
    : undefined;
}

export function residentBrowserEnvironment(
  desktop: ResidentDesktop,
  executablePath: string,
) {
  return {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: desktop.home,
    LANG: "en_US.UTF-8",
    DISPLAY: desktop.display,
    TORONTO_BROWSER_UID: String(desktop.uid),
    TORONTO_CHROMIUM_PATH: executablePath,
  };
}

export function remoteCityEnabled() {
  return process.env.REMOTE_CITY_BROWSER === "true" && process.platform === "linux";
}

/** One private X display per resident. No profile, VNC recording or public TCP listener. */
export async function createResidentDesktop(owner: string) {
  if (!remoteCityEnabled())
    throw new Error("Inline City browsing is unavailable on this server.");
  await closeResidentDesktop(owner);
  if (residentDesktops.size >= 2)
    throw new Error("Both private City browsers are in use. Please try again shortly.");
  const xvfb = spawn(
    "Xvfb",
    ["-displayfd", "3", "-screen", "0", "1280x900x24", "-nolisten", "tcp"],
    { stdio: ["ignore", "ignore", "ignore", "pipe"] },
  );
  const output = xvfb.stdio[3];
  if (!output) {
    xvfb.kill();
    throw new Error("Private display unavailable.");
  }
  const display = await Promise.race([
    once(output, "data").then(([data]) => `:${String(data).trim()}`),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Private display timed out.")),
        10_000,
      );
      timer.unref();
      xvfb.once("error", reject);
      xvfb.once("exit", () => reject(new Error("Private display unavailable.")));
    }),
  ]).catch((error) => {
    xvfb.kill();
    throw error;
  });
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") {
    xvfb.kill();
    throw new Error("Private browser port unavailable.");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const vnc = spawn(
    "x11vnc",
    [
      "-display",
      display,
      "-rfbport",
      String(port),
      "-localhost",
      "-nopw",
      "-forever",
      "-shared",
      "-noxdamage",
      "-quiet",
    ],
    { stdio: "ignore" },
  );
  vnc.once("error", () => {
    xvfb.kill();
  });
  const uid = (shared.torontoOneNextGuestUid =
    (shared.torontoOneNextGuestUid ?? 40000) + 1);
  const home = await mkdtemp(path.join(tmpdir(), "toronto-one-guest-"));
  const desktop: ResidentDesktop = {
    uid,
    home,
    display,
    port,
    expiresAt: Date.now() + 20 * 60_000,
    interactive: true,
    children: [xvfb, vnc],
  };
  residentDesktops.set(owner, desktop);
  return desktop;
}

export async function closeResidentDesktop(owner: string) {
  const desktop = residentDesktops.get(owner);
  residentDesktops.delete(owner);
  for (const process of desktop?.children ?? []) process.kill();
  if (desktop) await rm(desktop.home, { recursive: true, force: true });
}
