import test from "node:test";
import assert from "node:assert/strict";
import { simulateDisaster } from "../src/simulation.js";

test("a reroute brief maps the planned nonstop and the diversion layover", () => {
  const result = simulateDisaster({ airport: "EGLL", radiusNm: 5, severity: "severe" });
  const plan = result.plans.find((item) => item.flightId === "SKY101");
  assert.equal(plan.comparison.before.waypoints.map((point) => point.icao).join(">"), "KJFK>EGLL");
  assert.ok(plan.comparison.after.waypoints.some((point) => point.icao === "LFPG" && point.kind === "layover"));
  assert.equal(plan.comparison.deltas.newLayovers[0], "LFPG");
  assert.equal(plan.comparison.deltas.geometryChanged, true);
  assert.equal(plan.comparison.deltas.aircraftSwapped, false);
  assert.match(plan.comparison.deltas.timing, /EGLL/);
  assert.match(plan.comparison.deltas.aircraft, /No plane switch/);
  assert.match(plan.comparison.deltas.layover, /LFPG/);
  assert.equal(plan.plan.changeSummary.layover, plan.comparison.deltas.layover);
});

test("a maintenance-limited reroute swaps aircraft at the new layover", () => {
  const result = simulateDisaster({ airport: "LIRF", radiusNm: 5, severity: "severe" });
  const plan = result.plans.find((item) => item.flightId === "SKY822");
  assert.equal(plan.action, "reroute");
  assert.equal(plan.comparison.deltas.aircraftSwapped, true);
  assert.equal(plan.comparison.deltas.fromAircraft.id, "N906SK");
  assert.equal(plan.comparison.deltas.swapAt, plan.comparison.after.stops[0].icao);
  assert.ok(plan.comparison.after.stops[0].groundMinutes >= 55);
  assert.match(plan.comparison.deltas.aircraft, /Plane switch/);
});

test("a delayed flight keeps its track and can swap tails before departure", () => {
  const delayed = simulateDisaster({ airport: "KDEN", radiusNm: 5, severity: "moderate" });
  const sameTail = delayed.plans.find((item) => item.flightId === "SKY610");
  assert.equal(sameTail.action, "delay");
  assert.equal(sameTail.comparison.deltas.geometryChanged, false);
  assert.equal(sameTail.comparison.deltas.arrivalChangeMinutes, 90);
  assert.deepEqual(sameTail.comparison.deltas.newLayovers, []);
  assert.equal(sameTail.comparison.deltas.aircraftSwapped, false);

  const swapped = simulateDisaster({ airport: "LFPG", radiusNm: 5, severity: "moderate" });
  const maintenance = swapped.plans.find((item) => item.flightId === "SKY512");
  assert.equal(maintenance.action, "delay");
  assert.equal(maintenance.comparison.deltas.aircraftSwapped, true);
  assert.equal(maintenance.comparison.deltas.swapAt, "LFPG");
});

test("a cancellation protects passengers through a new connection", () => {
  const result = simulateDisaster({ airport: "LFPG", radiusNm: 5, severity: "severe" });
  const plan = result.plans.find((item) => item.flightId === "SKY512");
  assert.equal(plan.action, "cancel");
  assert.equal(plan.comparison.after.waypoints.filter((point) => point.kind === "layover").length, 1);
  assert.equal(plan.comparison.deltas.newLayovers.length, 1);
  assert.equal(plan.comparison.deltas.aircraftSwapped, true);
  assert.match(plan.comparison.deltas.layover, /layover/i);
});
