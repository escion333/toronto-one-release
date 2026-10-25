"use client";

import { useEffect, useRef, useState } from "react";
import type RFB from "@novnc/novnc";
import { Keyboard, LockKeyhole } from "lucide-react";
import { appPath } from "@/lib/app-path";
import { Button } from "@/components/ui/button";

/** Resident-controlled pixels/input. No DOM, screenshots or keystrokes enter chat/model state. */
export function CityBrowser() {
  const screen = useRef<HTMLDivElement>(null);
  const keyboard = useRef<HTMLInputElement>(null);
  const connection = useRef<RFB | null>(null);
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState("Connecting your private City browser…");
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const response = await fetch(appPath("/api/city-browser"), { cache: "no-store" });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        typeof data !== "object" ||
        data === null ||
        !("available" in data) ||
        !data.available
      )
        throw new Error(
          "Inline browsing is unavailable. On a local Mac, use the City browser window.",
        );
      if (!disposed) setAvailable(true);
      const { default: RemoteFramebuffer } = await import("@novnc/novnc");
      if (disposed || !screen.current) return;
      const url = new URL(appPath("/api/city-browser/socket"), window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const rfb = new RemoteFramebuffer(screen.current, url.href, { shared: false });
      connection.current = rfb;
      rfb.scaleViewport = true;
      rfb.background = "#ffffff";
      rfb.addEventListener("connect", () =>
        setStatus("You’re in control. Sign in directly with the City."),
      );
      rfb.addEventListener("disconnect", () => {
        if (!disposed)
          setStatus(
            "Browser control ended. Resume below, or reconnect if sign-in is unfinished.",
          );
      });
    })().catch((error) => {
      if (!disposed)
        setStatus(
          error instanceof Error ? error.message : "The City browser is unavailable.",
        );
    });
    return () => {
      disposed = true;
      connection.current?.disconnect();
      connection.current = null;
    };
  }, []);
  function key(keysym: number) {
    connection.current?.sendKey(keysym, null);
  }
  return (
    <section className="city-browser" aria-label="Private City browser">
      <p className="city-browser-origin">
        <LockKeyhole size={14} aria-hidden="true" /> anc.ca.apm.activecommunities.com
      </p>
      <p className="card-footnote" role="status">
        {status}
      </p>
      <div ref={screen} className="city-browser-screen" hidden={!available} />
      <div className="city-browser-controls" hidden={!available}>
        <Button variant="outline" size="sm" onClick={() => keyboard.current?.focus()}>
          <Keyboard size={16} aria-hidden="true" /> Keyboard
        </Button>
        <Button variant="ghost" size="sm" onClick={() => key(0xff09)}>
          Tab
        </Button>
        <Button variant="ghost" size="sm" onClick={() => key(0xff0d)}>
          Enter
        </Button>
        <input
          ref={keyboard}
          type="password"
          className="city-browser-keyboard"
          aria-label="Keyboard for the private City browser"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            for (const character of event.currentTarget.value) {
              const point = character.codePointAt(0);
              if (point !== undefined) key(point > 255 ? 0x01000000 | point : point);
            }
            event.currentTarget.value = "";
          }}
          onKeyDown={(event) => {
            const code = {
              Backspace: 0xff08,
              Enter: 0xff0d,
              Tab: 0xff09,
              Escape: 0xff1b,
            }[event.key];
            if (code) {
              event.preventDefault();
              key(code);
            }
          }}
        />
      </div>
      <p className="card-footnote">
        A private remote browser, not a City login embedded in chat. Credentials travel
        to the City through this server; they are not recorded or sent to the AI.
        Password-manager autofill may be unavailable.
      </p>
    </section>
  );
}
