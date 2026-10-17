/**
 * Build a committed real-schedule slice from US BTS On-Time Performance data.
 *
 * BEFORE RUNNING — confirm terms of use:
 *   https://www.bts.gov/topics/airlines-and-airports/airline-information-download
 *   https://www.transtats.bts.gov/
 * BTS airline on-time data is generally treated as US government public information, but
 * you must verify the current terms and any attribution requirements before committing
 * derived JSON into this repository. Do not proceed if the license is unclear.
 *
 * Workflow:
 *   1. Download a monthly On-Time Performance CSV (Marketing Carrier On-Time Performance)
 *      for one month into data/raw/bts/ (git-ignored).
 *   2. Optionally place a DB1B market CSV for connection-rate hints.
 *   3. npm run build:bts -- --carrier AA --date 2024-06-15
 *   4. Review data/reference/bts-slice.json, then commit if terms allow.
 *
 * Output is a Skyward-shaped snapshot of real tails and rotations for ONE carrier on ONE day.
 * Crew and maintenance remain synthetic when this slice is loaded (not implemented here —
 * this script only builds the reference JSON).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(root, "data/raw/bts");
const OUT = join(root, "data/reference/bts-slice.json");

function parseArgs(argv) {
  const out = { carrier: "AA", date: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--carrier") out.carrier = String(argv[++i] || "").toUpperCase();
    if (argv[i] === "--date") out.date = String(argv[++i] || "");
  }
  return out;
}

/** Minimal CSV parser (quoted fields). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""])));
}

function findInputCsv() {
  if (!existsSync(RAW_DIR)) {
    throw new Error(`Missing ${RAW_DIR}. Download a BTS On-Time CSV into data/raw/bts/ after confirming terms of use.`);
  }
  const files = readdirSync(RAW_DIR).filter((name) => name.toLowerCase().endsWith(".csv"));
  if (!files.length) throw new Error(`No CSV files in ${RAW_DIR}`);
  return join(RAW_DIR, files.sort()[0]);
}

function minutesFromHhmm(value) {
  const raw = String(value || "").padStart(4, "0");
  if (!/^\d{4}$/.test(raw)) return null;
  return Number(raw.slice(0, 2)) * 60 + Number(raw.slice(2));
}

const { carrier, date } = parseArgs(process.argv.slice(2));
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Usage: npm run build:bts -- --carrier AA --date YYYY-MM-DD");
  console.error("Confirm BTS terms of use before committing any output.");
  process.exit(1);
}

const inputPath = findInputCsv();
console.log(`Reading ${inputPath}`);
console.log(`Filter: carrier=${carrier} date=${date}`);
console.log("Reminder: verify https://www.bts.gov/ terms before committing data/reference/bts-slice.json");

const rows = parseCsv(readFileSync(inputPath, "utf8"));
// Column names vary slightly by BTS year; accept common aliases.
const get = (row, ...names) => {
  for (const name of names) if (row[name] !== undefined && row[name] !== "") return row[name];
  return "";
};

const day = rows.filter((row) => {
  const marketing = get(row, "Marketing_Airline_Network", "MKT_UNIQUE_CARRIER", "Reporting_Airline", "OP_UNIQUE_CARRIER");
  const flightDate = get(row, "FlightDate", "FL_DATE");
  return marketing === carrier && flightDate.startsWith(date);
});

if (!day.length) {
  throw new Error(`No rows for carrier ${carrier} on ${date}. Check the CSV month and column names.`);
}

const flights = day.map((row, index) => {
  const origin = get(row, "Origin", "ORIGIN");
  const destination = get(row, "Dest", "DEST");
  const tail = get(row, "Tail_Number", "TAIL_NUM") || `UNK${index}`;
  const dep = minutesFromHhmm(get(row, "CRSDepTime", "CRS_DEP_TIME"));
  const arr = minutesFromHhmm(get(row, "CRSArrTime", "CRS_ARR_TIME"));
  return {
    id: `${carrier}${get(row, "Flight_Number_Marketing_Airline", "MKT_FLIGHT_NUMBER", "Flight_Number_Reporting_Airline") || index}`,
    callsign: `${carrier}${get(row, "Flight_Number_Marketing_Airline", "MKT_FLIGHT_NUMBER") || index}`,
    origin,
    destination,
    aircraftId: tail,
    scheduledOffsetMinutes: dep ?? 0,
    arrivalOffsetMinutes: arr ?? (dep ?? 0) + 120,
    passengers: null,
    source: "bts_ontime"
  };
});

const tails = [...new Set(flights.map((flight) => flight.aircraftId))];
const rotations = tails.map((tailId) => ({
  tailId,
  flightIds: flights.filter((flight) => flight.aircraftId === tailId)
    .sort((a, b) => a.scheduledOffsetMinutes - b.scheduledOffsetMinutes)
    .map((flight) => flight.id)
}));

const slice = {
  source: "bts_ontime",
  attribution: "Derived from US Bureau of Transportation Statistics Airline On-Time Performance data. Verify current BTS terms before redistribution.",
  carrier,
  date,
  capturedAt: new Date().toISOString(),
  inputFile: inputPath.replace(/\\/g, "/"),
  summary: { flights: flights.length, tails: tails.length },
  flights,
  rotations,
  notes: [
    "Crew and maintenance are not present in BTS On-Time data; keep them synthetic in Skyward.",
    "Airport codes here are IATA; map to ICAO before merging with the Skyward network.",
    "This slice is a reference artifact only — the runtime generator remains the default network."
  ]
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(slice, null, 2)}\n`);
console.log(`Wrote ${OUT} (${flights.length} flights, ${tails.length} tails)`);
console.log("Not loaded by the server yet. Confirm license, then wire a selector if desired.");
