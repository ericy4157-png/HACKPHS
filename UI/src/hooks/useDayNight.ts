import { useEffect, useState } from "react";

export type SkyMode = "day" | "night";

/** Day roughly 6:00–18:00 local; otherwise night. */
export function isDayAt(date: Date): boolean {
  const hour = date.getHours() + date.getMinutes() / 60;
  return hour >= 6 && hour < 18;
}

export function useDayNight(pollMs = 60_000): SkyMode {
  const [mode, setMode] = useState<SkyMode>(() =>
    isDayAt(new Date()) ? "day" : "night",
  );

  useEffect(() => {
    const tick = () => {
      setMode(isDayAt(new Date()) ? "day" : "night");
    };
    tick();
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs]);

  return mode;
}
