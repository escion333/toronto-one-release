import { appPath } from "../../lib/app-path.ts";
import type { MascotState } from "../../lib/demo/types.ts";

export const MASCOT_FRAME_SIZE = 256;
export const MASCOT_ATLAS_COLUMNS = 8;
export const MASCOT_FPS = 12;
export const MASCOT_ASSET_ROOT = appPath("/mascot/avatar-v1");

type Clip =
  | { frames: number; playback: "loop" | "once" }
  | { frames: number; playback: "hold"; holdFrame: number };

/** Counts include the duplicate neutral endpoint supplied by the Blender export. */
export const mascotClips = {
  idle: { frames: 49, playback: "loop" },
  listening: { frames: 37, playback: "hold", holdFrame: 18 },
  thinking: { frames: 49, playback: "hold", holdFrame: 24 },
  working: { frames: 37, playback: "loop" },
  success: { frames: 31, playback: "once" },
  needs_input: { frames: 37, playback: "hold", holdFrame: 18 },
  error: { frames: 37, playback: "once" },
} satisfies Record<MascotState, Clip>;

export function mascotFrame(state: MascotState, elapsedMs: number) {
  const clip = mascotClips[state];
  const step = Math.floor((Math.max(0, elapsedMs) * MASCOT_FPS) / 1_000);
  if (clip.playback === "loop") {
    return { frame: step % (clip.frames - 1), complete: false };
  }
  if (clip.playback === "hold") {
    return {
      frame: Math.min(step, clip.holdFrame),
      complete: step >= clip.holdFrame,
    };
  }
  return {
    frame: step >= clip.frames - 1 ? 0 : step,
    complete: step >= clip.frames - 1,
  };
}
