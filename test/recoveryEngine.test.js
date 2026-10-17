import test from "node:test";
import assert from "node:assert/strict";
import { flights, networkIndex } from "../src/data.js";
import { buildPlanLayers, simulateAircraftKnockOn } from "../src/recoveryEngine.js";
import { buildOperationalSnapshot } from "../src/scenarios.js";

test("knock-on layers stop when turn buffer absorbs the delay", () => {
  // Pick a tail with at least two later legs and a positive ground buffer.
  const tailId = [...networkIndex.legsByTail.entries()].find(([, legs]) => legs.length >= 3)?.[0];
  assert.ok(tailId);
  const legs = networkIndex.legsByTail.get(tailId);
  const flight = legs[0];
  const ground = legs[1].scheduledOffsetMinutes - flight.arrivalOffsetMinutes;
  const turn = legs[1].turnBeforeMinutes ?? 0;
  const buffer = Math.max(0, ground - turn);
  const delay = Math.max(1, Math.floor(buffer / 2) || 1);

  const layers = simulateAircraftKnockOn(flight, delay);
  assert.ok(layers.length >= 1);
  assert.equal(layers[0].kind, "aircraft_knock_on");
  assert.equal(layers[0].flightId, legs[1].id);
  if (delay <= buffer) {
    assert.equal(layers[0].absorbed, true);
    assert.equal(layers[0].delayMinutes, 0);
    assert.equal(layers.length, 1);
  }
});

test("large delay propagates across multiple later legs until absorbed or the chain ends", () => {
  const entry = [...networkIndex.legsByTail.entries()].find(([, legs]) => legs.length >= 4);
  assert.ok(entry);
  const [, legs] = entry;
  const flight = legs[0];
  const layers = simulateAircraftKnockOn(flight, 24 * 60);
  assert.ok(layers.length >= 1);
  assert.ok(layers.every((layer) => layer.kind === "aircraft_knock_on"));
  assert.ok(layers.length <= legs.length - 1);
  // Once absorbed, nothing follows.
  const absorbedAt = layers.findIndex((layer) => layer.absorbed);
  if (absorbedAt >= 0) assert.equal(layers.length, absorbedAt + 1);
});

test("buildPlanLayers always starts with the disrupted leg as layer 0", () => {
  const flight = flights.find((item) => item.status === "scheduled");
  const layers = buildPlanLayers({ flight, action: "delay", delayMinutes: 90, summary: "test delay" });
  assert.equal(layers[0].index, 0);
  assert.equal(layers[0].kind, "disrupted_leg");
  assert.equal(layers[0].flightId, flight.id);
  assert.equal(layers[0].action, "delay");
});

test("scenario plans expose additive layers and stay pending", () => {
  const plans = buildOperationalSnapshot(0).plans;
  assert.ok(plans.length > 0);
  for (const plan of plans) {
    assert.equal(plan.approvalStatus, "pending");
    assert.ok(Array.isArray(plan.layers));
    assert.equal(plan.layers[0].kind, "disrupted_leg");
    assert.equal(plan.layers[0].flightId, plan.flightId);
  }
});
