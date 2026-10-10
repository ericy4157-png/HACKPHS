/**
 * Freeze normal operations plus the four seeded scenarios into the compact UI demo file.
 *
 * Writes UI/public/demo/demoSnapshot.json:
 *   { capturedAt, baseFlights (compact markers for every leg), scenarios: [{ incident, affectedFlights }] }
 *
 * Run from the repo root: npm run freeze:demo
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildBaselineSnapshot, buildOperationalSnapshot, SCENARIO_COUNT } from "../src/scenarios.js";
import { toUiFlights, toUiIncident } from "../src/uiApi.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../UI/public/demo");
const outPath = join(outDir, "demoSnapshot.json");

function compactMarker(flight) {
  return {
    id: flight.id,
    callsign: flight.callsign,
    origin: flight.origin,
    destination: flight.destination,
    status: "ok",
    lat: flight.lat,
    lng: flight.lng,
    passengers: flight.passengers,
    dayIndex: flight.dayIndex,
    inWindow: false,
    compact: true
  };
}

const scenarios = [];
let baseFlights = null;

const snapshots = [buildBaselineSnapshot(), ...Array.from({ length: SCENARIO_COUNT }, (_, index) => buildOperationalSnapshot(index))];

for (const snapshot of snapshots) {
  const full = toUiFlights(snapshot);
  const active = toUiFlights(snapshot, { scope: "active" });
  if (!baseFlights) {
    baseFlights = full.map(compactMarker);
  }
  // Omit layers from the freeze until the UI renders them (keeps the demo file smaller).
  const affectedFlights = active
    .filter((flight) => !flight.compact)
    .map(({ layers, ...flight }) => flight);
  scenarios.push({
    incident: {
      ...toUiIncident(snapshot),
      simMinutes: 0,
      tickSeconds: 12,
      lastTickAt: null,
      lastOpsNote: null,
      planRevision: 0
    },
    affectedFlights
  });
}

const payload = {
  capturedAt: new Date().toISOString(),
  baseFlights,
  scenarios
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload)}\n`);
const kb = Math.round(Buffer.byteLength(JSON.stringify(payload)) / 1024);
console.log(`Wrote ${outPath} (${kb} KB, ${baseFlights.length} base flights, ${scenarios.length} scenarios)`);
