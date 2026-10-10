import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { builtInAirports } from "../src/builtInAirports.js";
import { ANCHOR_FLIGHTS } from "../src/networkPlan.js";
import { airports, getReferenceAirport, readAirportSnapshot, referenceSnapshotLoaded } from "../src/referenceData.js";

const run = promisify(execFile);

test("all 32 network airports load from the snapshot with finite coordinates", () => {
  assert.equal(referenceSnapshotLoaded, true, "data/reference/airports.json should be committed and valid");
  assert.equal(airports.length, 32);
  assert.equal(new Set(airports.map((airport) => airport.icao)).size, 32);
  for (const airport of airports) {
    assert.ok(Number.isFinite(airport.lat) && Number.isFinite(airport.lon), `${airport.icao} coordinates`);
    assert.ok(airport.runwayFt > 0, `${airport.icao} runway`);
    assert.equal(getReferenceAirport(airport.icao).source, "ourairports");
  }
});

test("network airports keep their existing response fields", () => {
  for (const airport of airports) {
    assert.deepEqual(Object.keys(airport).sort(), ["city", "icao", "lat", "lon", "name", "runwayFt", "status"]);
  }
});

test("an unknown ICAO code has no reference airport", () => {
  assert.equal(getReferenceAirport("ZZZZ"), null);
});

test("missing, malformed and incomplete snapshot files are rejected with a reason", () => {
  const dir = mkdtempSync(join(tmpdir(), "skyward-ref-"));
  const malformed = join(dir, "malformed.json");
  const badEntry = join(dir, "bad-entry.json");
  writeFileSync(malformed, "{ not json");
  writeFileSync(badEntry, JSON.stringify({ KJFK: { icao: "KJFK", lat: "40.6", lon: -73.7 } }));

  for (const path of [join(dir, "missing.json"), malformed, badEntry]) {
    const { snapshot, error } = readAirportSnapshot(path);
    assert.equal(snapshot, null);
    assert.match(error, /\S/);
  }
});

test("with no snapshot file the server still starts on built-in airport values", async () => {
  const script = `
    const { server } = await import("./src/server.js");
    await new Promise((resolve) => server.listen(0, resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    const health = await (await fetch(base + "/health")).json();
    const { airports } = await (await fetch(base + "/v1/airports")).json();
    const flights = await (await fetch(base + "/api/flights")).json();
    server.close();
    console.log(JSON.stringify({ health: health.status, airports, flightIds: flights.map((flight) => flight.id) }));
  `;
  const { stdout, stderr } = await run(process.execPath, ["--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NODE_ENV: "test", SKYWARD_AIRPORTS_SNAPSHOT: join(tmpdir(), "skyward-does-not-exist.json") }
  });
  const result = JSON.parse(stdout.trim().split("\n").pop());

  assert.equal(result.health, "ok");
  // The network is generated from the built-in coordinates, so only its anchors are fixed.
  for (const anchor of ANCHOR_FLIGHTS) assert.ok(result.flightIds.includes(anchor.id), `${anchor.id} present`);
  assert.ok(result.flightIds.length > ANCHOR_FLIGHTS.length);
  assert.deepEqual(result.airports.map(({ icao, lat, lon, runwayFt }) => ({ icao, lat, lon, runwayFt })),
    builtInAirports.map(({ icao, lat, lon, runwayFt }) => ({ icao, lat, lon, runwayFt })));
  assert.equal(stderr.match(/Airport reference snapshot unavailable/g)?.length, 1, "exactly one warning");
});
