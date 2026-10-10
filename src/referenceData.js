import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { builtInAirports } from "./builtInAirports.js";

/**
 * Reference airport data, loaded once at startup from the committed OurAirports snapshot
 * (data/reference/airports.json, built by `npm run build:reference`).
 *
 * The snapshot only replaces lat, lon and runwayFt on the network airports, so every API
 * response keeps its existing shape. Extra fields such as elevation are available through
 * getReferenceAirport(). If the file is missing or invalid, one warning is logged and the
 * built-in values are used so the server still starts.
 */

export const DEFAULT_SNAPSHOT_PATH = fileURLToPath(new URL("../data/reference/airports.json", import.meta.url));

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Read and validate an airport snapshot file.
 * Returns { snapshot, error }: snapshot is the parsed object keyed by ICAO, or null with a reason.
 */
export function readAirportSnapshot(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const reason = error.code === "ENOENT" ? "file not found" : error.message;
    return { snapshot: null, error: `${path}: ${reason}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { snapshot: null, error: `${path}: expected an object keyed by ICAO code` };
  }
  const invalid = Object.entries(parsed).filter(([icao, entry]) => entry?.icao !== icao || !isFiniteNumber(entry.lat) || !isFiniteNumber(entry.lon));
  if (invalid.length) {
    return { snapshot: null, error: `${path}: invalid entries for ${invalid.map(([icao]) => icao).join(", ")}` };
  }
  return { snapshot: parsed, error: null };
}

/** Network airport with snapshot coordinates and runway length applied where available. */
function mergeAirport(builtIn, reference) {
  if (!reference) return { ...builtIn };
  return {
    ...builtIn,
    lat: reference.lat,
    lon: reference.lon,
    runwayFt: isFiniteNumber(reference.longestRunwayFt) && reference.longestRunwayFt > 0 ? reference.longestRunwayFt : builtIn.runwayFt
  };
}

const snapshotPath = process.env.SKYWARD_AIRPORTS_SNAPSHOT || DEFAULT_SNAPSHOT_PATH;
const { snapshot, error } = readAirportSnapshot(snapshotPath);
if (error) console.warn(`[skyward] Airport reference snapshot unavailable (${error}); using built-in airport values.`);

/** True when airport data came from the reference snapshot rather than the built-in fallback. */
export const referenceSnapshotLoaded = snapshot !== null;

/** Network airports from built-ins merged with the reference snapshot. Objects are shared and mutable. */
export const airports = builtInAirports.map((builtIn) => mergeAirport(builtIn, snapshot?.[builtIn.icao]));

/**
 * Reference view of one network airport by ICAO code, or null if it is not in the network.
 * Includes elevation and the data source; values fall back to built-ins where the snapshot has none.
 */
export function getReferenceAirport(icao) {
  const networkAirport = airports.find((item) => item.icao === icao);
  if (!networkAirport) return null;
  const reference = snapshot?.[icao];
  return {
    icao,
    iata: reference?.iata ?? null,
    name: reference?.name ?? networkAirport.name,
    city: networkAirport.city,
    lat: networkAirport.lat,
    lon: networkAirport.lon,
    elevationFt: reference?.elevationFt ?? null,
    longestRunwayFt: networkAirport.runwayFt,
    source: reference ? "ourairports" : "built-in"
  };
}
