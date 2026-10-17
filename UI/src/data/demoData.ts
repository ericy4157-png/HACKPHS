import type { Flight, Incident, ScenarioSnapshot } from "../types";

/**
 * Offline demo data: a compact freeze of the backend's four seeded scenarios.
 * Loaded lazily from /demo/demoSnapshot.json (in UI/public) so it is not bundled into the JS chunk.
 *
 * Format:
 *   { capturedAt, baseFlights: compact markers[], scenarios: [{ incident, affectedFlights[] }] }
 *
 * Rebuild with `npm run freeze:demo` from the repo root.
 */

type CompactDemoFile = {
  capturedAt: string;
  baseFlights: Flight[];
  scenarios: { incident: Incident; affectedFlights: Flight[] }[];
};

let cached: ScenarioSnapshot[] | null = null;

function expandScenario(
  baseFlights: Flight[],
  incident: Incident,
  affectedFlights: Flight[],
): ScenarioSnapshot {
  const byId = new Map(baseFlights.map((f) => [f.id, { ...f }]));
  for (const flight of affectedFlights) {
    byId.set(flight.id, { ...flight });
  }
  return { incident, flights: [...byId.values()] };
}

/** Load and expand the compact demo file into full ScenarioSnapshot objects. */
export async function loadDemoScenarios(): Promise<ScenarioSnapshot[]> {
  if (cached) return cached;
  const res = await fetch("/demo/demoSnapshot.json");
  if (!res.ok) throw new Error(`Demo snapshot unavailable (${res.status})`);
  const file = (await res.json()) as CompactDemoFile;
  cached = file.scenarios.map((s) => expandScenario(file.baseFlights, s.incident, s.affectedFlights));
  return cached;
}
