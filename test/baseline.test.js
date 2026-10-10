import test from "node:test";
import assert from "node:assert/strict";
import { buildBaselineSnapshot, SCENARIO_COUNT } from "../src/scenarios.js";
import { toUiFlights, toUiIncident } from "../src/uiApi.js";
import { BASELINE_MAINTENANCE_TAILS } from "../src/aircraftPerformance.js";

// server.js only auto-listens on :3000 outside NODE_ENV=test, so set it before importing.
process.env.NODE_ENV = "test";
const { server } = await import("../src/server.js");

test("normal operations has no active events and only a few pending maintenance delays", () => {
  const snapshot = buildBaselineSnapshot();
  assert.equal(snapshot.activeEvents.length, 0);
  assert.equal(snapshot.plans.length, BASELINE_MAINTENANCE_TAILS);
  assert.ok(snapshot.plans.every((plan) => plan.action === "delay" && plan.approvalStatus === "pending"));
  assert.ok(snapshot.plans.every((plan) => /Unscheduled maintenance/.test(plan.plan.reason)));
  assert.equal(new Set(snapshot.plans.map((plan) => plan.aircraft)).size, snapshot.plans.length);

  const flights = toUiFlights(snapshot);
  assert.equal(flights.filter((flight) => flight.status !== "ok").length, BASELINE_MAINTENANCE_TAILS);
  const incident = toUiIncident(snapshot);
  assert.equal(incident.baseline, true);
  assert.equal(incident.center, null);
  assert.match(incident.summary, /need a decision \(maintenance or ordinary ops delays\)/);
});

test("normal operations is deterministic", () => {
  const pick = () => buildBaselineSnapshot().plans.map((plan) => `${plan.flightId}:${plan.aircraft}`);
  assert.deepEqual(pick(), pick());
});

test("the server starts in normal operations, steps through every scenario, then returns", async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const names = [(await (await fetch(`${base}/api/incident`)).json()).name];
  for (let step = 0; step <= SCENARIO_COUNT; step += 1) {
    names.push((await (await fetch(`${base}/api/scenario/next?scope=active`, { method: "POST" })).json()).incident.name);
  }
  assert.equal(names[0], "Normal operations");
  assert.equal(names[1], "Atlantic hurricane band");
  assert.equal(names[SCENARIO_COUNT + 1], "Normal operations");
});
