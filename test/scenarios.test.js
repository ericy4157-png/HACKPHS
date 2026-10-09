import test from "node:test";
import assert from "node:assert/strict";
import { operationalNetwork } from "../src/network.js";
import { buildOperationalSnapshot } from "../src/scenarios.js";

test("the seeded test network covers at least thirty airports", () => {
  const network = operationalNetwork();
  assert.ok(network.airportCount >= 30);
  assert.ok(network.flightCount >= 30);
});

test("refresh scenarios rotate without requiring user-entered incident data", () => {
  const first = buildOperationalSnapshot(0), next = buildOperationalSnapshot(1);
  assert.notEqual(first.scenario, next.scenario);
  assert.ok(first.plans.length > 0);
  assert.equal(first.mode, "synthetic_network_test_run");
});
