import test from "node:test";
import assert from "node:assert/strict";
import { flights, networkIndex } from "../src/data.js";
import { attachAlternatives, buildAlternatives, passengerMinutes } from "../src/recoveryCandidates.js";
import { createOpsSession } from "../src/opsSession.js";
import { buildDelayPlan, buildHoldPlan, evaluateReroutes } from "../src/simulation.js";

function distinctKey(plan) {
  return [plan.action, plan.plan?.estimatedDelayMinutes || 0, plan.plan?.diversionAirport || "", plan.comparison?.deltas?.toAircraft?.id || ""].join("|");
}

test("delay primaries get 2–3 pending futures that differ by action, delay, or route", () => {
  const flight = flights.find((item) => item.status === "scheduled");
  assert.ok(flight);
  const primary = { ...buildDelayPlan(flight, { delayMinutes: 90, reason: "test delay" }), id: "PLAN-TEST-1" };
  const attached = attachAlternatives(primary, { flight, delayMinutes: 90 });
  const set = [attached, ...(attached.alternatives || [])];
  assert.ok(set.length >= 2 && set.length <= 3);
  assert.ok(set.every((plan) => plan.approvalStatus === "pending"));
  assert.equal(new Set(set.map(distinctKey)).size, set.length);
  assert.equal(attached.action, "delay");
  assert.equal(attached.plan.estimatedDelayMinutes, 90);
});

test("negative-fuel diverts never appear as alternatives", () => {
  const session = createOpsSession({ seed: 3 });
  const snap = session.loadDisaster(0);
  for (const plan of snap.plans) {
    for (const alt of [plan, ...(plan.alternatives || [])]) {
      if (alt.action !== "reroute") continue;
      const margin = alt.plan?.reroute?.operationalAssessment?.fuelMarginMinutes;
      if (margin != null) assert.ok(margin >= 0, `${alt.id} has fuel margin ${margin}`);
    }
  }
});

test("evaluateReroutes only marks non-negative margins as safe", () => {
  const flight = [...networkIndex.flightById.values()].find((item) => item.status === "airborne") || flights[0];
  const { safe } = evaluateReroutes(flight, [flight.destination]);
  for (const item of safe) {
    assert.ok(item.reroute.operationalAssessment.fuelMarginMinutes >= 0);
  }
});

test("accept with planId commits that alternative; default accept keeps the primary", () => {
  const session = createOpsSession({ seed: 3 });
  const snap = session.loadBaseline();
  const pending = snap.plans.find((plan) => plan.approvalStatus === "pending" && plan.alternatives?.length);
  assert.ok(pending);
  const alt = pending.alternatives[0];
  session.decide(pending.flightId, "accept", "tester", { planId: alt.id });
  const committed = session.snapshot().plans.find((item) => item.flightId === pending.flightId);
  assert.equal(committed.approvalStatus, "approved");
  assert.equal(committed.action, alt.action);
  assert.equal(committed.plan?.estimatedDelayMinutes || 0, alt.plan?.estimatedDelayMinutes || 0);

  const session2 = createOpsSession({ seed: 3 });
  const snap2 = session2.loadBaseline();
  const same = snap2.plans.find((plan) => plan.flightId === pending.flightId);
  session2.decide(same.flightId, "accept", "tester");
  const primaryCommit = session2.snapshot().plans.find((item) => item.flightId === same.flightId);
  assert.equal(primaryCommit.action, same.action);
});

test("after accept, changedFlightIds match newly superseded pending plans and exclude the decided id", () => {
  const session = createOpsSession({ seed: 3 });
  const snap = session.loadBaseline();
  const pending = snap.plans.filter((plan) => plan.approvalStatus === "pending");
  assert.ok(pending.length >= 1);
  const first = pending[0];
  const after = session.decide(first.flightId, "accept", "tester");
  const changed = after.changedFlightIds || [];
  assert.ok(!changed.includes(first.flightId));
  const superseded = after.plans
    .filter((plan) => plan.approvalStatus === "pending" && plan.supersededReason)
    .map((plan) => plan.flightId)
    .sort();
  assert.deepEqual([...changed].sort(), superseded);
});

test("attaching alternatives does not change the primary action", () => {
  const flight = flights.find((item) => item.status === "scheduled");
  const hold = buildHoldPlan(flight, { reason: "manual" });
  const attached = attachAlternatives({ ...hold, id: "PLAN-HOLD" }, { flight });
  assert.equal(attached.action, "hold_for_human_review");
  const alts = buildAlternatives(hold, { flight });
  assert.ok(alts.every((plan) => plan.action !== undefined));
  assert.ok(passengerMinutes(hold, flight) >= 0);
});
