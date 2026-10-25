"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { MascotState } from "@/lib/demo/types";
import { cn } from "@/lib/utils";
import {
  MASCOT_ASSET_ROOT,
  MASCOT_ATLAS_COLUMNS,
  MASCOT_FRAME_SIZE,
  mascotClips,
  mascotFrame,
} from "./mascot-playback";
import styles from "./agent-mascot.module.css";

export interface AgentMascotProps {
  state: MascotState;
  size?: "welcome" | "companion" | "compact";
  motion?: "system" | "off";
  className?: string;
}

export const mascotLabels: Record<MascotState, string> = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Thinking it through",
  working: "Checking official services",
  success: "Result ready",
  needs_input: "Over to you",
  error: "Let’s sort this out",
};

/** Explicit agent states drive rendered Blender frames, independently of chat text. */
export function AgentMascot({
  state,
  size = "companion",
  motion = "system",
  className,
}: AgentMascotProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outgoingRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef(new Map<MascotState, ImageBitmap>());

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      for (const bitmap of cache.values()) bitmap.close();
      cache.clear();
    };
  }, []);

  useEffect(() => {
    const rootNode = rootRef.current;
    const canvasNode = canvasRef.current;
    const outgoingNode = outgoingRef.current;
    const canvasContext = canvasNode?.getContext("2d");
    const oldContext = outgoingNode?.getContext("2d");
    if (!rootNode || !canvasNode || !outgoingNode || !canvasContext || !oldContext)
      return;
    const root = rootNode;
    const canvas = canvasNode;
    const outgoing = outgoingNode;
    const context = canvasContext;
    const outgoingContext = oldContext;

    const controller = new AbortController();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let intersecting = !("IntersectionObserver" in window);
    let bitmap: ImageBitmap | undefined;
    let loading = false;
    let failed = false;
    let completed = false;
    let elapsed = 0;
    let previousTime: number | undefined;
    let previousFrame = -1;
    let animationId = 0;
    let transition: Animation | undefined;

    const reduced = () => motion === "off" || preference.matches;
    const active = () => !document.hidden && intersecting && !reduced();

    function pause() {
      cancelAnimationFrame(animationId);
      animationId = 0;
      previousTime = undefined;
    }

    function draw(frame: number) {
      if (!bitmap) return;
      context.clearRect(0, 0, MASCOT_FRAME_SIZE, MASCOT_FRAME_SIZE);
      context.drawImage(
        bitmap,
        (frame % MASCOT_ATLAS_COLUMNS) * MASCOT_FRAME_SIZE,
        Math.floor(frame / MASCOT_ATLAS_COLUMNS) * MASCOT_FRAME_SIZE,
        MASCOT_FRAME_SIZE,
        MASCOT_FRAME_SIZE,
        0,
        0,
        MASCOT_FRAME_SIZE,
        MASCOT_FRAME_SIZE,
      );
      previousFrame = frame;
      canvas.dataset.painted = "true";
      root.dataset.frame = String(frame);
    }

    function tick(now: number) {
      animationId = 0;
      if (disposed || !active()) return;
      if (previousTime !== undefined) elapsed += now - previousTime;
      previousTime = now;
      const next = mascotFrame(state, elapsed);
      if (next.frame !== previousFrame) draw(next.frame);
      completed = next.complete;
      root.dataset.playback = completed ? "held" : "playing";
      if (!completed) animationId = requestAnimationFrame(tick);
    }

    function showAtlas() {
      // Preserve the previous raster during the fade, without retaining its atlas.
      const hasPrevious = canvas.dataset.painted === "true" && !reduced();
      if (hasPrevious) {
        outgoingContext.clearRect(0, 0, MASCOT_FRAME_SIZE, MASCOT_FRAME_SIZE);
        outgoingContext.drawImage(canvas, 0, 0);
      }
      draw(mascotFrame(state, elapsed).frame);
      canvas.style.opacity = "1";
      outgoing.style.opacity = "0";
      root.dataset.renderer = "atlas";
      transition?.cancel();
      if (hasPrevious) {
        transition = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 200,
          easing: "ease-out",
        });
      }
    }

    async function loadAtlas() {
      if (loading || failed || disposed) return;
      loading = true;
      root.dataset.playback = "loading";
      try {
        const cache = cacheRef.current;
        const cached = cache.get(state);
        if (cached) {
          cache.delete(state);
          cache.set(state, cached);
          bitmap = cached;
        } else {
          const response = await fetch(`${MASCOT_ASSET_ROOT}/${state}.webp`, {
            signal: controller.signal,
            credentials: "omit",
          });
          if (!response.ok) throw new Error("Mascot atlas unavailable");
          const decoded = await createImageBitmap(await response.blob());
          if (disposed) {
            decoded.close();
            return;
          }
          const expectedHeight =
            Math.ceil(mascotClips[state].frames / MASCOT_ATLAS_COLUMNS) *
            MASCOT_FRAME_SIZE;
          if (
            decoded.width !== MASCOT_ATLAS_COLUMNS * MASCOT_FRAME_SIZE ||
            decoded.height !== expectedHeight
          ) {
            decoded.close();
            throw new Error("Mascot atlas dimensions do not match its clip");
          }
          cache.set(state, decoded);
          bitmap = decoded;
          // Each decoded atlas is about 10–14 MiB. Bound memory across state changes.
          while (cache.size > 3) {
            const oldest = cache.keys().next().value;
            if (oldest === undefined) break;
            cache.get(oldest)?.close();
            cache.delete(oldest);
          }
        }
        if (disposed) return;
        if (active()) {
          showAtlas();
          animationId = requestAnimationFrame(tick);
        }
      } catch {
        if (disposed) return;
        failed = true;
        canvas.style.opacity = "0";
        outgoing.style.opacity = "0";
        root.dataset.renderer = "poster";
        root.dataset.playback = "unavailable";
      } finally {
        loading = false;
      }
    }

    function synchronize() {
      pause();
      if (reduced()) {
        transition?.cancel();
        canvas.style.opacity = "0";
        outgoing.style.opacity = "0";
        root.dataset.renderer = "poster";
        root.dataset.playback = "static";
        return;
      }
      if (!active()) {
        root.dataset.playback = "paused";
        return;
      }
      if (!bitmap) void loadAtlas();
      else {
        if (canvas.style.opacity === "0") showAtlas();
        if (!completed) animationId = requestAnimationFrame(tick);
        else root.dataset.playback = "held";
      }
    }

    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(([entry]) => {
            intersecting = entry?.isIntersecting ?? false;
            synchronize();
          })
        : null;
    observer?.observe(root);
    document.addEventListener("visibilitychange", synchronize);
    preference.addEventListener("change", synchronize);
    synchronize();

    return () => {
      disposed = true;
      controller.abort();
      pause();
      transition?.cancel();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", synchronize);
      preference.removeEventListener("change", synchronize);
    };
  }, [state, motion]);

  return (
    <div
      ref={rootRef}
      className={cn("agent-mascot", `mascot-${size}`, styles.root, className)}
      role="img"
      aria-label={`Toronto One raccoon, ${mascotLabels[state].toLowerCase()}.`}
      data-state={state}
      data-motion={motion}
      data-renderer="poster"
    >
      <span className={cn(styles.layer, styles.fallback)} aria-hidden="true">
        T1
      </span>
      <Image
        key={state}
        className={cn(styles.layer, styles.poster)}
        src={`${MASCOT_ASSET_ROOT}/${state === "idle" ? "poster" : `${state}-still`}.webp`}
        width={MASCOT_FRAME_SIZE}
        height={MASCOT_FRAME_SIZE}
        alt=""
        aria-hidden="true"
        unoptimized
        onLoad={() => {
          const root = rootRef.current;
          if (root) root.dataset.poster = "ready";
        }}
        onError={(event) => {
          const image = event.currentTarget;
          if (!image.src.endsWith("/poster.webp")) {
            image.src = `${MASCOT_ASSET_ROOT}/poster.webp`;
          } else {
            image.style.visibility = "hidden";
            const root = rootRef.current;
            if (root) {
              root.dataset.poster = "failed";
              if (root.dataset.renderer !== "atlas") {
                root.dataset.renderer = "fallback";
              }
            }
          }
        }}
      />
      <canvas
        ref={outgoingRef}
        className={cn(styles.layer, styles.canvas)}
        width={MASCOT_FRAME_SIZE}
        height={MASCOT_FRAME_SIZE}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className={cn(styles.layer, styles.canvas)}
        width={MASCOT_FRAME_SIZE}
        height={MASCOT_FRAME_SIZE}
        aria-hidden="true"
      />
    </div>
  );
}
