import test from "node:test";
import assert from "node:assert/strict";
import { buildComparison } from "../src/comparison.js";
import { fleet, flights, rotations } from "../src/data.js";
import { simulateDisaster } from "../src/simulation.js";

const flightById = new Map(flights.map((flight) => [flight.id, flight]));

/** Where a tail sits after its rotation ends: last airport and the time it is ready there. */
function endOfRotation(tailId) {
  const tail = fleet.find((item) => item.id === tailId);
  const rotation = rotations.find((item) => item.tailId === tailId);
  if (!rotation?.flightIds.length) {
    return { airport: tail.parkedAt || tail.location, readyAt: -Infinity };
  }
  const last = flightById.get(rotation.flightIds.at(-1));
  return { airport: last.destination, readyAt: last.arrivalOffsetMinutes + tail.minimumTurnMinutes };
}

/** A made-up scheduled A321neo leg on N906SK (6 h from maintenance, so a delay asks for a swap). */
function delayedLeg(origin, destination, scheduledOffsetMinutes) {
  return { id: "TEST1", callsign: "TEST1", origin, destination, passengers: 150, aircraft: "A321neo", aircraftId: "N906SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes };
}

test("a reroute brief maps the planned nonstop and the diversion layover", () => {
  const result = simulateDisaster({ airport: "KMIA", radiusNm: 5, severity: "severe" });
  const plan = result.plans.find((item) => item.flightId === "SKY820");
  assert.equal(plan.comparison.before.waypoints.map((point) => point.icao).join(">"), "KDFW>KMIA");
  const layover = plan.comparison.deltas.newLayovers[0];
  assert.ok(layover, "diversion adds a layover");
  assert.ok(plan.comparison.after.waypoints.some((point) => point.icao === layover && point.kind === "layover"));
  assert.equal(plan.comparison.deltas.geometryChanged, true);
  assert.equal(plan.comparison.deltas.aircraftSwapped, false);
  assert.match(plan.comparison.deltas.timing, /KMIA/);
  assert.match(plan.comparison.deltas.aircraft, /No plane switch/);
  assert.match(plan.comparison.deltas.layover, new RegExp(layover));
  assert.equal(plan.plan.changeSummary.layover, plan.comparison.deltas.layover);
});

test("a delayed flight keeps its track and does not switch planes when maintenance is not due", () => {
  const delayed = simulateDisaster({ airport: "KDEN", radiusNm: 5, severity: "moderate" });
  const sameTail = delayed.plans.find((item) => item.flightId === "SKY610");
  assert.equal(sameTail.action, "delay");
  assert.equal(sameTail.comparison.deltas.geometryChanged, false);
  assert.equal(sameTail.comparison.deltas.arrivalChangeMinutes, 90);
  assert.deepEqual(sameTail.comparison.deltas.newLayovers, []);
  assert.equal(sameTail.comparison.deltas.aircraftSwapped, false);
});

test("a tail on the ground at the flight's airport is proposed as the replacement", () => {
  // N912SK (A321neo, 24 h from maintenance) sits idle at the end of its rotation.
  const { airport, readyAt } = endOfRotation("N912SK");
  const comparison = buildComparison({ flight: delayedLeg(airport, "EGLL", readyAt + 60), action: "delay", delayMinutes: 90 });
  assert.equal(comparison.deltas.aircraftSwapped, true);
  assert.equal(comparison.deltas.swapAt, airport);
  assert.equal(comparison.deltas.swapCheck.neededAt, airport);
  const chosen = endOfRotation(comparison.deltas.toAircraft.id);
  assert.equal(chosen.airport, airport, "the proposed tail is at the swap airport");
  assert.match(comparison.deltas.swapCheck.reason, new RegExp(`on the ground at ${airport}`));
});

test("a free tail based elsewhere is never proposed", () => {
  // After every rotation has ended all operating tails are free; pick an airport none ends at.
  const operating = fleet.filter((tail) => !tail.reserve);
  const latest = Math.max(...operating.map((tail) => endOfRotation(tail.id).readyAt));
  const occupied = new Set(operating.map((tail) => endOfRotation(tail.id).airport));
  const emptyAirport = ["KBOS", "KIAD", "KPDX", "PANC"].find((icao) => !occupied.has(icao));
  assert.ok(emptyAirport, "need an airport with no idle operating tail");
  const comparison = buildComparison({ flight: delayedLeg(emptyAirport, "KJFK", latest + 60), action: "delay", delayMinutes: 90 });
  const { swapCheck } = comparison.deltas;
  assert.equal(comparison.deltas.aircraftSwapped, false);
  assert.deepEqual(swapCheck.busyTailsSkipped, []);
  assert.ok(swapCheck.tailsElsewhereSkipped.length > 0);
  assert.ok(swapCheck.tailsElsewhereSkipped.every((item) => item.location !== emptyAirport));
  assert.match(swapCheck.reason, new RegExp(`is on the ground at ${emptyAirport} and free when needed`));
  assert.match(swapCheck.reason, new RegExp(`Free but not on the ground at ${emptyAirport} in time`));
});

test("a tail that lands at the airport too close to the needed time is not proposed", () => {
  // Needed 1 minute before N912SK has finished its minimum turn after landing.
  const { airport, readyAt } = endOfRotation("N912SK");
  const comparison = buildComparison({ flight: delayedLeg(airport, "EGLL", readyAt - 1 - 90), action: "delay", delayMinutes: 90 });
  assert.notEqual(comparison.deltas.toAircraft.id, "N912SK");
  assert.ok(comparison.deltas.swapCheck.tailsElsewhereSkipped.some((item) => item.tailId === "N912SK" && item.location === airport));
  if (!comparison.deltas.aircraftSwapped) assert.match(comparison.deltas.swapCheck.reason, new RegExp(`N912SK \\(at ${airport}, ready 1 min too late\\)`));
});

test("a cancellation protects passengers through a new connection", () => {
  const result = simulateDisaster({ airport: "LFPG", radiusNm: 5, severity: "severe" });
  const plan = result.plans.find((item) => item.flightId === "SKY512");
  assert.equal(plan.action, "cancel");
  assert.equal(plan.comparison.after.waypoints.filter((point) => point.kind === "layover").length, 1);
  assert.equal(plan.comparison.deltas.newLayovers.length, 1);
  assert.match(plan.comparison.deltas.layover, /layover/i);
  assert.equal(plan.comparison.deltas.aircraftSwapped, false);
  assert.match(plan.comparison.deltas.swapCheck.reason, /is on the ground at LFPG and free when needed/);
});

test("SKY101 in a London windstorm finds a fuel-legal diversion in the mid-size network", () => {
  const plan = simulateDisaster({ type: "windstorm", airport: "EGLL", radiusNm: 45, severity: "severe" }).plans.find((item) => item.flightId === "SKY101");
  assert.equal(plan.action, "reroute");
  assert.ok(plan.plan.diversionAirport);
  assert.ok(plan.plan.reroute?.operationalAssessment.fuelMarginMinutes >= 0);
  assert.equal(plan.approvalStatus, "pending");
});

test("SKY822 in scenario 4 is held for manual review because no alternate meets the fuel reserve", () => {
  const plan = simulateDisaster({ type: "wildfire", airport: "LIRF", radiusNm: 65, severity: "moderate" }).plans.find((item) => item.flightId === "SKY822");
  assert.equal(plan.action, "hold_for_human_review");
  assert.match(plan.plan.reason, /no alternate meets the fuel reserve/);
  assert.ok(plan.plan.alternateFuelChecks.every((check) => check.fuelMarginMinutes < 0));
  assert.equal(plan.comparison.deltas.aircraftSwapped, false);
  assert.equal(plan.approvalStatus, "pending");
});

test("a negative-margin first choice falls back to the best alternate with a non-negative margin", () => {
  // A 300 NM closure also shuts LFPG and EHAM; EDDF ranks first but is short on fuel.
  const plan = simulateDisaster({ airport: "EGLL", radiusNm: 300, severity: "moderate" }).plans.find((item) => item.flightId === "SKY101");
  const [first] = plan.plan.alternateFuelChecks;
  assert.ok(first.fuelMarginMinutes < 0);
  assert.equal(plan.action, "reroute");
  assert.notEqual(plan.plan.diversionAirport, first.airport);
  const chosen = plan.plan.alternateFuelChecks.find((check) => check.airport === plan.plan.diversionAirport);
  assert.ok(chosen.fuelMarginMinutes >= 0);
  assert.equal(plan.plan.reroute.operationalAssessment.safeToPropose, true);
});
