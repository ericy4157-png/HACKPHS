/**
 * Build data/reference/airports.json from OurAirports CSV exports.
 *
 *   1. Download airports.csv and runways.csv from https://ourairports.com/data/
 *      into data/raw/ (git-ignored).
 *   2. npm run build:reference
 *   3. Commit data/reference/airports.json.
 *
 * Only the airports in the Skyward network (src/builtInAirports.js) are written.
 * The script fails loudly if a required column or any network airport is missing.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { builtInAirports } from "../src/builtInAirports.js";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const AIRPORTS_CSV = root("data/raw/airports.csv");
const RUNWAYS_CSV = root("data/raw/runways.csv");
const OUTPUT = root("data/reference/airports.json");

const REQUIRED_AIRPORT_COLUMNS = ["ident", "iata_code", "name", "latitude_deg", "longitude_deg", "elevation_ft"];
const REQUIRED_RUNWAY_COLUMNS = ["airport_ident", "length_ft", "closed"];

/**
 * Parse RFC 4180-style CSV text into an array of rows (arrays of strings).
 * Handles quoted fields containing commas, newlines and doubled quotes ("").
 */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCsv(path, requiredColumns) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${path} (${error.code || error.message}). Download it from https://ourairports.com/data/ first.`);
  }
  const [header = [], ...body] = parseCsvRows(text.replace(/^\uFEFF/, ""));
  console.log(`${path}\n  header: ${header.join(", ")}`);
  const missing = requiredColumns.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`${path} is missing required column(s): ${missing.join(", ")}`);
  console.log(`  required columns present: ${requiredColumns.join(", ")}`);
  return body.map((values) => Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""])));
}

const toNumberOrNull = (value) => (value === "" || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));

function longestOpenRunwayByAirport(runways) {
  const longest = new Map();
  for (const runway of runways) {
    const length = toNumberOrNull(runway.length_ft);
    if (runway.closed === "1" || !length) continue;
    longest.set(runway.airport_ident, Math.max(longest.get(runway.airport_ident) ?? 0, length));
  }
  return longest;
}

function buildSnapshot() {
  const airportRows = readCsv(AIRPORTS_CSV, REQUIRED_AIRPORT_COLUMNS);
  const runwayRows = readCsv(RUNWAYS_CSV, REQUIRED_RUNWAY_COLUMNS);
  const byIdent = new Map(airportRows.map((row) => [row.ident, row]));
  const longestRunway = longestOpenRunwayByAirport(runwayRows);

  const codes = builtInAirports.map((airport) => airport.icao);
  const missing = codes.filter((icao) => !byIdent.has(icao));
  if (missing.length) throw new Error(`airports.csv has no row for network airport(s): ${missing.join(", ")}`);

  const snapshot = {};
  for (const icao of codes) {
    const row = byIdent.get(icao);
    const lat = toNumberOrNull(row.latitude_deg);
    const lon = toNumberOrNull(row.longitude_deg);
    if (lat === null || lon === null) throw new Error(`airports.csv row for ${icao} has no valid coordinates`);
    snapshot[icao] = {
      icao,
      iata: row.iata_code || null,
      name: row.name,
      lat,
      lon,
      elevationFt: toNumberOrNull(row.elevation_ft),
      longestRunwayFt: longestRunway.get(icao) ?? null
    };
  }
  return snapshot;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const snapshot = buildSnapshot();
    mkdirSync(root("data/reference"), { recursive: true });
    writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
    const noRunway = Object.values(snapshot).filter((airport) => airport.longestRunwayFt === null).map((airport) => airport.icao);
    console.log(`Wrote ${Object.keys(snapshot).length} airports to ${OUTPUT}`);
    if (noRunway.length) console.warn(`No open runway length for: ${noRunway.join(", ")} (built-in values will be used)`);
  } catch (error) {
    console.error(`build:reference failed: ${error.message}`);
    process.exit(1);
  }
}
