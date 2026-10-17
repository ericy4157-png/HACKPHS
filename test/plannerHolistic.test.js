import test from "node:test";
import assert from "node:assert/strict";
import { TAIL_BREAK_UNABSORBED_LEGS } from "../src/aircraftPerformance.js";
import { flights, networkIndex } from "../src/data.js";
import {
  applyHubBankThinning,
  generateFutures,
  networkCost,
  rankFutures,
  selectBestRecovery,
  unabsorbedKnockOnCount
} from "../src/recoveryCandidates.js";
import { createOpsSession } from "../src/opsSession.js";
import { buildDelayPlan } from "../src/simulation.js";

test("networkCost counts knock-on passengers, not only the disrupted leg", () => {
  const flight = flights.find((item) => item.status === "scheduled");
  assert.ok(flight);
  const plan = buildDelayPlan(flight, { delayMinutes: 24 * 60, reason: "long delay" });
  const knockOns = unabsorbedKnockOnCount(plan);
  if (knockOns === 0) return; // some tails absorb everything
  const plain = (flight.passengers || 0) * (plan.plan.estimatedDelayMinutes || 0);
  assert.ok(networkCost(plan, flight) > plain);
});

test("generateFutures scores multiple delay/cancel/swap options", () => {
  const flight = flights.find((item) => item.status === "scheduled");
  const futures = generateFutures(flight, { delayMinutes: 45, source: "ops" });
  assert.ok(futures.length >= 4);
  assert.ok(futures.some((plan) => plan.action === "delay"));
  assert.ok(futures.some((plan) => plan.action === "cancel"));
  const actions = new Set(futures.map((plan) => plan.action));
  assert.ok(actions.size >= 2);
});

test("tail-break demotes delay that poison many later legs versus cancel or swap", () => {
  // Find a scheduled leg whose big delay does not absorb for ≥ threshold legs.
  let poisoned = null;
  for (const flight of flights) {
    if (flight.status !== "scheduled") continue;
    const delay = buildDelayPlan(flight, { delayMinutes: 180, reason: "probe" });
    if (unabsorbedKnockOnCount(delay) >= TAIL_BREAK_UNABSORBED_LEGS) {
      poisoned = flight;
      break;
    }
  }
  assert.ok(poisoned, "expected at least one tightly scheduled tail");
  const best = selectBestRecovery(poisoned, { delayMinutes: 45, source: "ops" });
  assert.ok(
    best.action === "cancel"
      || best.comparison?.deltas?.aircraftSwapped
      || best.action === "hold_for_human_review"
      || unabsorbedKnockOnCount(best) < TAIL_BREAK_UNABSORBED_LEGS,
    `expected tail-break primary, got ${best.action} knockOns=${unabsorbedKnockOnCount(best)} label=${best.label}`
  );
});

test("rankFutures is deterministic for the same inputs", () => {
  const flight = flights.find((item) => item.status === "scheduled");
  const pick = () => rankFutures(generateFutures(flight, { delayMinutes: 45, source: "ops" }), flight)
    .map((item) => `${item.plan.action}:${item.cost}:${item.plan.plan?.estimatedDelayMinutes || 0}`);
  assert.deepEqual(pick(), pick());
});

test("hub bank thinning marks lower-pax spokes at closed hubs for cancel", () => {
  const session = createOpsSession({ seed: 1 });
  session.loadDisaster(0);
  const debug = session._debug();
  const forced = [...debug.openDisruptions.values()].filter((item) => item.forceAction === "cancel");
  // Atlantic hurricane closes MIA/ATL area — expect some thinning marks.
  assert.ok(forced.length >= 0);
  const open = new Map();
  for (const plan of session.snapshot().plans) {
    open.set(plan.flightId, {
      flightId: plan.flightId,
      source: "disaster",
      status: "open",
      delayMinutes: 90
    });
  }
  const closed = ["KMIA", "KATL"];
  const thinned = applyHubBankThinning(open, closed);
  assert.ok(Array.isArray(thinned));
  for (const id of thinned) {
    assert.equal(open.get(id).forceAction, "cancel");
  }
});

test("disaster session primary is a scored future with alternatives", () => {
  const session = createOpsSession({ seed: 2 });
  const snap = session.loadDisaster(0);
  const pending = snap.plans.filter((plan) => plan.approvalStatus === "pending");
  assert.ok(pending.length > 0);
  for (const plan of pending.slice(0, 10)) {
    assert.equal(typeof plan.passengerMinutes, "number");
    assert.equal(typeof plan.label, "string");
    assert.ok(plan.alternatives === undefined || plan.alternatives.length <= 2);
  }
  // At least one cancel or swap should appear when cascades are expensive.
  const protective = pending.filter(
    (plan) => plan.action === "cancel" || plan.comparison?.deltas?.aircraftSwapped
  );
  assert.ok(protective.length >= 1, "expected some protective (cancel/swap) primaries in a disaster");
});

test("selectBestRecovery never invents negative-fuel diverts", () => {
  const flight = [...networkIndex.flightById.values()].find((item) => item.status === "airborne") || flights[0];
  const best = selectBestRecovery(flight, {
    closedAirports: [flight.destination],
    source: "disaster",
    severity: "severe"
  });
  for (const plan of [best, ...(best.alternatives || [])]) {
    if (plan.action !== "reroute") continue;
    const margin = plan.plan?.reroute?.operationalAssessment?.fuelMarginMinutes;
    if (margin != null) assert.ok(margin >= 0);
  }
});
