import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

export type ResidentDesktop = {
  display: string;
  port: number;
  expiresAt: number;
  interactive: boolean;
  children: ChildProcess[];
};
const shared = globalThis as typeof globalThis & {
  torontoOneDesktops?: Map<string, ResidentDesktop>;
};
export const residentDesktops = (shared.torontoOneDesktops ??= new Map<
  string,
  ResidentDesktop
>());

export function remoteCityEnabled() {
  return process.env.REMOTE_CITY_BROWSER === "true" && process.platform === "linux";
}

/** One private X display per resident. No profile, VNC recording or public TCP listener. */
export async function createResidentDesktop(owner: string) {
  if (!remoteCityEnabled())
    throw new Error("Inline City browsing is unavailable on this server.");
  await closeResidentDesktop(owner);
  const xvfb = spawn(
    "Xvfb",
    ["-displayfd", "3", "-screen", "0", "430x900x24", "-nolisten", "tcp"],
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
  const desktop: ResidentDesktop = {
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
}
