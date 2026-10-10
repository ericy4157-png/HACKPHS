/**
 * Seeded ordinary disruptions (gate holds, ATC flow, late inbound, …).
 * Deterministic for a fixed seed and tick sequence.
 */
import {
  OPS_MINI_DELAY_MINUTES,
  OPS_MINI_TARGET_OPEN
} from "./aircraftPerformance.js";
import { flightsInWindow, DEFAULT_WINDOW_HOURS } from "./simulation.js";

export const OPS_REASONS = [
  "Gate hold — inbound late to the gate",
  "ATC flow restriction at departure",
  "Late inbound aircraft",
  "Crew connection running short",
  "Catering / cabin service delay"
];

/** Mulberry32 — small deterministic PRNG. */
export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    pick(list) {
      if (!list.length) return undefined;
      return list[Math.floor(this.next() * list.length)];
    }
  };
}

/**
 * Maybe open new ops disruptions so pending ops issues trend toward OPS_MINI_TARGET_OPEN.
 * @param {Map<string, object>} openDisruptions
 * @param {{ rng: ReturnType<typeof createRng>, simMinutes: number, windowHours?: number }} ctx
 * @returns {{ spawned: object[], note: string | null }}
 */
export function maybeSpawnOpsNoise(openDisruptions, { rng, simMinutes, windowHours = DEFAULT_WINDOW_HOURS }) {
  const pendingOps = [...openDisruptions.values()].filter(
    (item) => item.source === "ops" && item.status === "open"
  );
  const need = Math.max(0, OPS_MINI_TARGET_OPEN - pendingOps.length);
  if (need === 0) return { spawned: [], note: null };

  const blocked = new Set(openDisruptions.keys());
  const candidates = flightsInWindow(windowHours)
    .filter((flight) => flight.status !== "airborne" && !blocked.has(flight.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) return { spawned: [], note: null };

  const spawned = [];
  // Shuffle a working copy with the seeded RNG, then take `need`.
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  for (let n = 0; n < need && n < pool.length; n += 1) {
    const flight = pool[n];
    const reason = rng.pick(OPS_REASONS);
    const delayMinutes = rng.pick(OPS_MINI_DELAY_MINUTES);
    const disruption = {
      flightId: flight.id,
      source: "ops",
      severity: "minor",
      reason,
      delayMinutes,
      createdAtSim: simMinutes,
      status: "open"
    };
    openDisruptions.set(flight.id, disruption);
    spawned.push(disruption);
  }

  const note = spawned.length
    ? spawned.map((item) => `${item.reason} on ${item.flightId} (+${item.delayMinutes}m)`).join("; ")
    : null;
  return { spawned, note };
}
