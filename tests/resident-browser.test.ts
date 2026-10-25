import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeResidentDesktop,
  residentBrowserEnvironment,
  type ResidentDesktop,
} from "../src/lib/ai/remote-desktop.ts";

test("remote browser control requires its owner, exact origin, active handoff and live lease", () => {
  const desktop: ResidentDesktop = {
    display: ":2",
    uid: 40001,
    home: "/tmp/guest",
    port: 5000,
    expiresAt: 2000,
    interactive: true,
    children: [],
  };
  const registry = new Map([["owner", desktop]]);
  assert.ok(
    authorizeResidentDesktop(
      "toronto-one-agent=owner",
      "https://app.example",
      "https://app.example",
      registry,
      1000,
    ),
  );
  assert.equal(
    authorizeResidentDesktop(
      "toronto-one-agent=other",
      "https://app.example",
      "https://app.example",
      registry,
      1000,
    ),
    undefined,
  );
  assert.equal(
    authorizeResidentDesktop(
      "toronto-one-agent=owner",
      "https://other.example",
      "https://app.example",
      registry,
      1000,
    ),
    undefined,
  );
  assert.equal(
    authorizeResidentDesktop(
      "toronto-one-agent=owner",
      undefined,
      "https://app.example",
      registry,
      1000,
    ),
    undefined,
  );
  assert.equal(
    authorizeResidentDesktop(
      "toronto-one-agent=owner",
      "https://app.example",
      "https://app.example",
      registry,
      2000,
    ),
    undefined,
  );
  desktop.interactive = false;
  assert.equal(
    authorizeResidentDesktop(
      "toronto-one-agent=owner",
      "https://app.example",
      "https://app.example",
      registry,
      1000,
    ),
    undefined,
  );
});

test("resident-controlled Chromium receives only the guest environment, never server credentials", () => {
  const environment = residentBrowserEnvironment(
    {
      display: ":2",
      uid: 40001,
      home: "/tmp/guest",
      port: 5000,
      expiresAt: 2000,
      interactive: true,
      children: [],
    },
    "/browser/chrome",
  );
  assert.deepEqual(
    Object.keys(environment).sort(),
    [
      "DISPLAY",
      "HOME",
      "LANG",
      "PATH",
      "TORONTO_BROWSER_UID",
      "TORONTO_CHROMIUM_PATH",
    ].sort(),
  );
  assert.equal("AI_GATEWAY_API_KEY" in environment, false);
  assert.equal("PRIVATE_STORE_TOKEN" in environment, false);
});
