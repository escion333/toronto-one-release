"use client";

import { useEffect } from "react";

/** Keep the app, not the document, inside Safari's visible area above the keyboard. */
export function useAppViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    let restingHeight = viewport.height;
    let restingWidth = viewport.width;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Pinch zoom remains a browser operation; never resize the app to a zoomed crop.
        if (viewport.scale !== 1) return;
        const element = document.activeElement;
        const editing =
          element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
        // Recent Safari also shrinks innerHeight, so measure the change from
        // the resting viewport rather than comparing those two current heights.
        if (Math.abs(restingWidth - viewport.width) > 100) {
          restingWidth = viewport.width;
          restingHeight = viewport.height;
        }
        restingHeight = editing
          ? Math.max(restingHeight, viewport.height)
          : viewport.height;
        root.style.setProperty("--app-height", `${viewport.height}px`);
        root.style.setProperty("--app-top", `${viewport.offsetTop}px`);
        root.dataset.keyboard = String(
          editing && restingHeight - viewport.height > 120,
        );
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
      delete root.dataset.keyboard;
    };
  }, []);
}
