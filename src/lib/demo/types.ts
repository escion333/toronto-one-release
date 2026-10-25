export const mascotStates = [
  "idle",
  "listening",
  "thinking",
  "working",
  "success",
  "needs_input",
  "error",
] as const;
export type MascotState = (typeof mascotStates)[number];
