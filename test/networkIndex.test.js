import test from "node:test";
import assert from "node:assert/strict";
import { flights, fleet, networkIndex, passengerGroups, rotations } from "../src/data.js";
import { buildOperationalSnapshot } from "../src/scenarios.js";
import { toUiFlights } from "../src/uiApi.js";

test("networkIndex covers every flight, airport, tail and passenger group", () => {
  assert.equal(networkIndex.flightById.size, flights.length);
  assert.equal(networkIndex.airportByIcao.size > 0, true);
  for (const tail of fleet) {
    assert.ok(networkIndex.legsByTail.has(tail.id));
    assert.ok(networkIndex.visitsByTail.has(tail.id));
  }
  for (const rotation of rotations) {
    assert.equal(networkIndex.legsByTail.get(rotation.tailId).length, rotation.flightIds.length);
  }
  let groupLinks = 0;
  for (const list of networkIndex.groupsByFlight.values()) groupLinks += list.length;
  assert.equal(groupLinks, passengerGroups.reduce((sum, group) => sum + group.flightIds.length, 0));
});

test("scope=active keeps full detail for planned and in-window flights only", () => {
  const snapshot = buildOperationalSnapshot(0);
  const full = toUiFlights(snapshot);
  const active = toUiFlights(snapshot, { scope: "active" });
  assert.equal(active.length, full.length);
  const compact = active.filter((flight) => flight.compact);
  const detailed = active.filter((flight) => !flight.compact);
  assert.ok(compact.length > 0, "multi-day network should produce compact markers");
  assert.ok(detailed.length > 0);
  for (const flight of detailed) {
    assert.ok(flight.originalPath?.length >= 2);
    assert.equal(flight.inWindow || flight.planId !== undefined || flight.status !== "ok", true);
  }
  for (const flight of compact) {
    assert.equal(flight.status, "ok");
    assert.equal(flight.inWindow, false);
    assert.equal(flight.originalPath, undefined);
  }
});
