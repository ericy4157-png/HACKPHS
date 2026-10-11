import { useCallback, useEffect, useMemo, useState } from "react";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Smoothstep so each story layer eases at both ends. */
export function easeStory(progress: number): number {
  const p = clamp01(progress);
  return p * p * (3 - 2 * p);
}

function span(progress: number, start: number, end: number): number {
  return easeStory((progress - start) / (end - start));
}

export type StoryLayers = {
  progress: number;
  eased: number;
  dash: number;
  swoosh: number;
  globe: number;
  rail: number;
  sky: number;
};

/** Staggered 0→1 tracks so the swoosh, iris and globe do not move as one slab. */
export function storyLayers(progress: number): StoryLayers {
  const p = clamp01(progress);
  return {
    progress: p,
    eased: easeStory(p),
    dash: 1 - span(p, 0.18, 0.72),
    swoosh: span(p, 0.04, 0.58),
    globe: span(p, 0.1, 0.7),
    rail: span(p, 0.62, 1),
    sky: span(p, 0.14, 0.62),
  };
}

/**
 * Scroll progress 0 (dashboard) → 1 (network) on a tall story scroller.
 */
export function useStoryScroll(scroller: HTMLElement | null) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!scroller) return;
    let frame = 0;
    const read = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      setProgress(max <= 0 ? 0 : scroller.scrollTop / max);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };
    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [scroller]);

  const scrollTo = useCallback(
    (target: "dashboard" | "network") => {
      if (!scroller) return;
      scroller.scrollTo({ top: target === "network" ? scroller.scrollHeight : 0, behavior: "smooth" });
    },
    [scroller],
  );

  const layers = useMemo(() => storyLayers(progress), [progress]);

  return { progress, layers, scrollTo };
}
