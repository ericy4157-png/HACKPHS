import test from "node:test";
import assert from "node:assert/strict";
import { RUNWAY_CATEGORIES, runwayRequirement, swapCompatibility } from "../src/aircraftPerformance.js";
import { airports } from "../src/data.js";
import { diversionOptions, runwayCheck } from "../src/routing.js";
import { buildOperationalSnapshot } from "../src/scenarios.js";
import { simulateDisaster } from "../src/simulation.js";

process.env.NODE_ENV = "test";
const { server } = await import("../src/server.js");

test("runway requirements keep the existing two limits, stricter for unknown types", () => {
  assert.equal(RUNWAY_CATEGORIES.widebody.minimumRunwayFt, 8500);
  assert.equal(RUNWAY_CATEGORIES.narrowbody.minimumRunwayFt, 6000);
  assert.equal(runwayRequirement("A350-900").requiredRunwayFt, 8500);
  assert.equal(runwayRequirement("B787-9").requiredRunwayFt, 8500);
  assert.equal(runwayRequirement("A321neo").requiredRunwayFt, 6000);
  assert.equal(runwayRequirement("B737-8").requiredRunwayFt, 6000);
  assert.equal(runwayRequirement("Q400").requiredRunwayFt, 8500);
  assert.match(runwayRequirement("Q400").basis, /unknown type/);
});

test("an alternate with too short a runway is never chosen", (t) => {
  const paris = airports.find((airport) => airport.icao === "LFPG");
  const originalRunway = paris.runwayFt;
  t.after(() => { paris.runwayFt = originalRunway; });

  // SKY101 (A350-900, needs 8,500 ft) normally diverts to LFPG when EGLL closes.
  paris.runwayFt = 8000;
  assert.equal(runwayCheck("LFPG", "A350-900").meetsRequirement, false);
  assert.ok(!diversionOptions({ lat: 48.1, lon: -38.4 }, "A350-900").some((option) => option.icao === "LFPG"));

  const plan = simulateDisaster({ airport: "EGLL", radiusNm: 5, severity: "severe" }).plans.find((item) => item.flightId === "SKY101");
  assert.equal(plan.action, "reroute");
  assert.notEqual(plan.plan.diversionAirport, "LFPG");
  const check = plan.plan.diversionRunwayCheck;
  assert.equal(check.airport, plan.plan.diversionAirport);
  assert.ok(check.longestRunwayFt >= check.requiredRunwayFt);
  assert.equal(check.requiredRunwayFt, 8500);
});

test("every alternate offered meets the aircraft's runway requirement", () => {
  for (const type of ["A350-900", "A321neo", "unknown-type"]) {
    for (const option of diversionOptions({ lat: 40, lon: -40 }, type)) {
      assert.ok(option.runwayCheck.longestRunwayFt >= option.runwayCheck.requiredRunwayFt, `${type} at ${option.icao}`);
    }
  }
});

test("swap compatibility allows same type and same family only", () => {
  assert.equal(swapCompatibility("A321neo", "A321neo").compatible, true);
  assert.equal(swapCompatibility("A321neo", "A320neo").compatible, true);
  assert.equal(swapCompatibility("A321neo", "A350-900").compatible, false);
  assert.equal(swapCompatibility("B787-9", "A350-900").compatible, false);
  assert.equal(swapCompatibility("B787-9", "unknown-type").compatible, false);
});

test("a swap between incompatible types is never proposed", () => {
  const plans = [
    ...[0, 1, 2, 3].flatMap((n) => buildOperationalSnapshot(n).plans),
    // A 72-hour window reaches tails that sit idle after their rotations, where swaps can happen.
    ...airports.flatMap((airport) => ["moderate", "severe"].flatMap((severity) => [24, 72]
      .flatMap((windowHours) => simulateDisaster({ airport: airport.icao, radiusNm: 5, severity, windowHours }).plans)))
  ];
  assert.ok(plans.some((plan) => plan.comparison.deltas.aircraftSwapped), "some swaps should still happen");
  for (const plan of plans) {
    const { aircraftSwapped, fromAircraft, toAircraft, swapCheck } = plan.comparison.deltas;
    assert.equal(typeof swapCheck.reason, "string");
    assert.equal(swapCheck.swapped, aircraftSwapped);
    if (aircraftSwapped) assert.equal(swapCompatibility(fromAircraft.type, toAircraft.type).compatible, true, `${plan.flightId}: ${fromAircraft.type} -> ${toAircraft.type}`);
  }
});

test("a cancelled widebody can take a compatible reserve parked at a hub", () => {
  // SKY204 is a B787-9; reserve N993SK (B787-9) is parked at EGLL in the mid-size network.
  const plan = buildOperationalSnapshot(1).plans.find((item) => item.flightId === "SKY204" && item.action === "cancel");
  assert.equal(plan.comparison.deltas.aircraftSwapped, true);
  assert.equal(plan.comparison.deltas.toAircraft.id, "N993SK");
  assert.match(plan.comparison.deltas.swapCheck.reason, /on the ground at/);
});

test("newly created plans, including the new fields, still start pending", () => {
  const plans = [...[0, 1, 2, 3].flatMap((n) => buildOperationalSnapshot(n).plans), ...simulateDisaster({ airport: "EGLL", radiusNm: 5, severity: "severe" }).plans];
  assert.ok(plans.every((plan) => plan.approvalStatus === "pending"));
});

test("/api/flights/:id adds the runway and swap fields without changing existing ones", async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  // The server starts in normal operations; one step moves it to the Atlantic hurricane scenario.
  await fetch(`${base}/api/scenario/next`, { method: "POST" });
  const flight = await (await fetch(`${base}/api/flights/SKY820`)).json();

  for (const key of ["id", "callsign", "origin", "destination", "status", "originalPath", "proposedPath", "delayMinutes", "passengers", "lat", "lng", "planId", "action", "approvalStatus", "originAirport", "destinationAirport", "originalRoute", "proposedRoute", "waypoints", "changes", "aircraft", "stops", "schedule", "requiredChecks"]) {
    assert.ok(key in flight, `existing field ${key}`);
  }
  assert.match(flight.proposedRoute, /^DFW → [A-Z]{3} → MIA$/);
  assert.equal(flight.diversionRunway.requiredRunwayFt, 6000);
  assert.equal(flight.diversionRunway.aircraftType, "A321neo");
  assert.equal(flight.diversionRunway.category, "narrowbody");
  assert.equal(flight.diversionRunway.basis, "type category");
  assert.equal(flight.diversionRunway.runwaySource, "ourairports");
  assert.match(flight.diversionRunway.code, /^[A-Z]{3}$/);
  assert.equal(flight.swapCheck.swapped, false);
  assert.equal(typeof flight.swapCheck.reason, "string");
});
