"use client";

import { useEffect, useRef, useState } from "react";
import type RFB from "@novnc/novnc";
import { ClipboardPaste, LockKeyhole, Maximize2, Minimize2 } from "lucide-react";
import { appPath } from "@/lib/app-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Resident-controlled pixels/input. No DOM, screenshots or keystrokes enter chat/model state. */
export function CityBrowser() {
  const container = useRef<HTMLElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const keyboard = useRef<HTMLInputElement>(null);
  const connection = useRef<RFB | null>(null);
  const [available, setAvailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
      rfb.addEventListener("connect", () => {
        if (disposed) return;
        setConnected(true);
        setStatus("Select a City field, then type or paste below.");
      });
      rfb.addEventListener("disconnect", () => {
        if (!disposed) {
          setConnected(false);
          setStatus(
            "Browser control ended. Resume below, or reconnect if sign-in is unfinished.",
          );
        }
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
  useEffect(() => {
    const update = () => setExpanded(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  function key(keysym: number) {
    connection.current?.sendKey(keysym, null);
  }
  function sendText(text: string) {
    if (!connected) return;
    // A clipboard shortcut can lose its key-up when focus leaves the canvas.
    // Release remote modifiers so pasted text cannot become City shortcuts.
    for (const modifier of [
      0xffe1, 0xffe2, 0xffe3, 0xffe4, 0xffe7, 0xffe8, 0xffe9, 0xffea, 0xffeb, 0xffec,
    ]) {
      connection.current?.sendKey(modifier, null, false);
    }
    // Send transient input directly over the private connection, never through chat,
    // React state, storage, telemetry, or the remote clipboard.
    for (const character of text) {
      const point = character.codePointAt(0);
      if (point !== undefined) key(point > 255 ? 0x01000000 | point : point);
    }
    setStatus("Text sent to the selected City field.");
  }
  async function paste() {
    try {
      sendText(await navigator.clipboard.readText());
    } catch {
      keyboard.current?.focus();
      setStatus(
        "Paste into the input below with Cmd+V, Ctrl+V or your device’s Paste menu.",
      );
    }
  }
  async function toggleExpanded() {
    try {
      if (document.fullscreenElement === container.current)
        await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setStatus(
        "Full screen is unavailable in this browser. You can still use the controls below.",
      );
    }
  }
  return (
    <section ref={container} className="city-browser" aria-label="Private City browser">
      <p className="city-browser-origin">
        <LockKeyhole size={14} aria-hidden="true" /> anc.ca.apm.activecommunities.com
      </p>
      <p className="card-footnote" role="status">
        {status}
      </p>
      <div ref={screen} className="city-browser-screen" hidden={!available} />
      <div className="city-browser-controls" hidden={!available}>
        <Button
          variant="outline"
          size="sm"
          disabled={!connected}
          onClick={() => void paste()}
        >
          <ClipboardPaste size={16} aria-hidden="true" /> Paste into City field
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!connected}
          onClick={() => key(0xff09)}
        >
          Tab
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!connected}
          onClick={() => key(0xff0d)}
        >
          Enter
        </Button>
        <Button variant="outline" size="sm" onClick={() => void toggleExpanded()}>
          {expanded ? (
            <Minimize2 size={16} aria-hidden="true" />
          ) : (
            <Maximize2 size={16} aria-hidden="true" />
          )}
          {expanded ? "Exit full screen" : "Expand browser"}
        </Button>
        <Input
          ref={keyboard}
          type="password"
          className="city-browser-keyboard"
          aria-label="Type or paste into the selected City field"
          placeholder="Select a City field above, then type or paste here"
          disabled={!connected}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onPaste={(event) => {
            event.preventDefault();
            sendText(event.clipboardData.getData("text/plain"));
            event.currentTarget.value = "";
          }}
          onChange={(event) => {
            sendText(event.currentTarget.value);
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
        to the City through this server; they are not recorded or sent to the AI. Select
        the City email or password field first, then use Paste into City field or the
        input above. Pasted text is cleared immediately. Password-manager autofill may
        be unavailable.
      </p>
    </section>
  );
}
