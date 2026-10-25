import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  MASCOT_ATLAS_COLUMNS,
  MASCOT_FPS,
  MASCOT_FRAME_SIZE,
  mascotClips,
  mascotFrame,
} from "../src/components/agent/mascot-playback.ts";
import { mascotStates } from "../src/lib/demo/types.ts";

const root = new URL("../public/mascot/avatar-v1/", import.meta.url);
const manifestSchema = z.object({
  frameSize: z.number(),
  columns: z.number(),
  fps: z.number(),
  states: z.record(
    z.string(),
    z.object({
      frames: z.number().int().positive(),
      loop: z.boolean(),
      holdFrameIndex: z.number().int().nullable(),
      atlasBytes: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
});

function webpInfo(bytes: Buffer) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  let dimensions: { width: number; height: number; alpha: boolean } | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    assert.ok(payload + length <= bytes.length, "complete WebP chunk");
    assert.notEqual(kind, "ANIM", "atlases must be still images");
    assert.notEqual(kind, "ANMF", "playback belongs to the explicit state controller");
    if (kind === "VP8X") {
      assert.equal(length, 10);
      dimensions = {
        width: 1 + bytes.readUIntLE(payload + 4, 3),
        height: 1 + bytes.readUIntLE(payload + 7, 3),
        alpha: (bytes.readUInt8(payload) & 0x10) !== 0,
      };
    }
    offset = payload + length + (length % 2);
  }
  assert.ok(dimensions, "extended WebP must identify its transparent canvas");
  return dimensions;
}

test("all seven explicit UI states have a finite playback policy", () => {
  assert.deepEqual(Object.keys(mascotClips).sort(), [...mascotStates].sort());
  for (const state of mascotStates) {
    for (const elapsed of [-1_000, 0, 83, 1_000, 60_000, 86_400_000]) {
      const result = mascotFrame(state, elapsed);
      assert.ok(Number.isInteger(result.frame), state);
      assert.ok(result.frame >= 0 && result.frame < mascotClips[state].frames, state);
    }
    assert.equal(mascotFrame(state, -1_000).frame, 0);
  }
});

test("loop playback skips the duplicate neutral endpoint without a double-frame pause", () => {
  for (const state of ["idle", "working"] as const) {
    const uniqueFrames = mascotClips[state].frames - 1;
    const visited = Array.from({ length: uniqueFrames + 2 }, (_, step) =>
      mascotFrame(state, ((step + 0.1) * 1_000) / MASCOT_FPS),
    );
    assert.deepEqual(
      visited.slice(0, uniqueFrames).map(({ frame }) => frame),
      Array.from({ length: uniqueFrames }, (_, index) => index),
    );
    assert.equal(visited[uniqueFrames]?.frame, 0);
    assert.equal(visited[uniqueFrames + 1]?.frame, 1);
    assert.ok(visited.every(({ complete }) => !complete));
  }
});

test("attentive gestures settle on the authored pose until the agent state changes", () => {
  for (const state of ["listening", "thinking", "needs_input"] as const) {
    const { holdFrame } = mascotClips[state];
    assert.deepEqual(mascotFrame(state, ((holdFrame - 0.5) * 1_000) / MASCOT_FPS), {
      frame: holdFrame - 1,
      complete: false,
    });
    for (const step of [holdFrame + 0.1, holdFrame + 100, holdFrame + 100_000]) {
      assert.deepEqual(mascotFrame(state, (step * 1_000) / MASCOT_FPS), {
        frame: holdFrame,
        complete: true,
      });
    }
  }
});

test("success and reassurance play once, then rest on neutral without repeating", () => {
  for (const state of ["success", "error"] as const) {
    const endpoint = mascotClips[state].frames - 1;
    assert.deepEqual(mascotFrame(state, ((endpoint - 0.5) * 1_000) / MASCOT_FPS), {
      frame: endpoint - 1,
      complete: false,
    });
    for (const step of [endpoint + 0.1, endpoint * 2 + 5, endpoint * 100]) {
      assert.deepEqual(mascotFrame(state, (step * 1_000) / MASCOT_FPS), {
        frame: 0,
        complete: true,
      });
    }
  }
});

test("published atlas contract covers every state, matches playback and retains alpha", async () => {
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(new URL("manifest.json", root), "utf8")),
  );
  assert.equal(manifest.frameSize, MASCOT_FRAME_SIZE);
  assert.equal(manifest.columns, MASCOT_ATLAS_COLUMNS);
  assert.equal(manifest.fps, MASCOT_FPS);
  assert.deepEqual(Object.keys(manifest.states).sort(), [...mascotStates].sort());
  for (const state of mascotStates) {
    const published = manifest.states[state];
    assert.ok(published, state);
    const clip = mascotClips[state];
    assert.equal(published.frames, clip.frames, state);
    assert.equal(published.loop, clip.playback === "loop", state);
    assert.equal(published.holdFrameIndex, "holdFrame" in clip ? clip.holdFrame : null);
    const bytes = await readFile(new URL(`${state}.webp`, root));
    assert.equal(bytes.length, published.atlasBytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), published.sha256);
    assert.deepEqual(webpInfo(bytes), {
      width: MASCOT_FRAME_SIZE * MASCOT_ATLAS_COLUMNS,
      height: Math.ceil(clip.frames / MASCOT_ATLAS_COLUMNS) * MASCOT_FRAME_SIZE,
      alpha: true,
    });
    const still = await readFile(new URL(`${state}-still.webp`, root));
    assert.deepEqual(webpInfo(still), {
      width: MASCOT_FRAME_SIZE,
      height: MASCOT_FRAME_SIZE,
      alpha: true,
    });
  }
  assert.deepEqual(webpInfo(await readFile(new URL("poster.webp", root))), {
    width: MASCOT_FRAME_SIZE,
    height: MASCOT_FRAME_SIZE,
    alpha: true,
  });
});
