import test from "node:test";
import assert from "node:assert/strict";
import { flights } from "../src/data.js";
import { buildOperationalSnapshot } from "../src/scenarios.js";
import { decideFlight, toUiFlights, toUiIncident } from "../src/uiApi.js";

test("every network flight is returned once, in IATA codes, with drawable paths", () => {
  const uiFlights = toUiFlights(buildOperationalSnapshot(0));
  assert.equal(uiFlights.length, flights.length);
  assert.equal(new Set(uiFlights.map((flight) => flight.id)).size, flights.length);
  for (const flight of uiFlights) {
    assert.match(flight.origin, /^[A-Z]{3}$/);
    assert.ok(flight.originalPath.length >= 2 && flight.proposedPath.length >= 2);
    assert.ok(Number.isFinite(flight.lat) && Number.isFinite(flight.lng));
  }
});

test("affected flights carry the before/after change story", () => {
  const reroute = toUiFlights(buildOperationalSnapshot(0)).find((flight) => flight.id === "SKY820");
  assert.equal(reroute.status, "rerouting");
  assert.match(reroute.proposedRoute, /^DFW → [A-Z]{3} → MIA$/);
  assert.match(reroute.stops[0].code, /^[A-Z]{3}$/);
  assert.match(reroute.changes.layover, new RegExp(reroute.stops[0].code));
  assert.doesNotMatch(reroute.changes.timing, /KMIA/);
});

test("a flight hit by two events shows its most disruptive plan", () => {
  const snapshot = buildOperationalSnapshot(0);
  assert.ok(snapshot.plans.filter((plan) => plan.flightId === "SKY702").length > 1);
  assert.equal(toUiFlights(snapshot).find((flight) => flight.id === "SKY702").action, "cancel");
});

test("accepting and rejecting update the flight and incident progress", () => {
  const snapshot = buildOperationalSnapshot(0);
  assert.equal(toUiIncident(snapshot).recoveryProgress, 0);
  assert.equal(decideFlight(snapshot, "SKY820", "accept").status, "rerouted");
  assert.equal(decideFlight(snapshot, "SKY702", "reject").status, "disrupted");
  assert.ok(toUiIncident(snapshot).recoveryProgress > 0);
  assert.equal(decideFlight(snapshot, "SKY101", "accept"), null);
});
