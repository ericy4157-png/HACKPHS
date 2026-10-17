import test from "node:test";
import assert from "node:assert/strict";
import { createOpsSession } from "../src/opsSession.js";
import { createRng, maybeSpawnOpsNoise } from "../src/opsNoise.js";
import { OPS_MINI_TARGET_OPEN, OPS_TICK_SIM_MINUTES } from "../src/aircraftPerformance.js";
import { simulatePassengerImpact } from "../src/recoveryEngine.js";
import { networkIndex, passengerGroups } from "../src/data.js";
import { buildComparison } from "../src/comparison.js";
import { flights } from "../src/data.js";

test("ops noise spawn is deterministic for a fixed seed and tick count", () => {
  const run = () => {
    const open = new Map();
    const rng = createRng(99);
    const notes = [];
    for (let i = 0; i < 5; i += 1) {
      const { spawned, note } = maybeSpawnOpsNoise(open, { rng, simMinutes: i * 5 });
      notes.push(`${spawned.map((s) => s.flightId).join(",")}:${note || ""}`);
    }
    return notes;
  };
  assert.deepEqual(run(), run());
});

test("session tick advances simMinutes and can open ordinary ops issues", () => {
  const session = createOpsSession({ seed: 7 });
  session.loadBaseline();
  const before = session.snapshot();
  assert.equal(before.simMinutes, 0);
  const after = session.tick();
  assert.equal(after.simMinutes, OPS_TICK_SIM_MINUTES);
  const opsOpen = [...session._debug().openDisruptions.values()].filter(
    (item) => item.source === "ops" && item.status === "open"
  );
  assert.ok(opsOpen.length <= OPS_MINI_TARGET_OPEN);
  assert.ok(opsOpen.length >= 1 || after.lastOpsNote == null);
});

test("two ticks with the same seed produce the same ops flight ids", () => {
  const ids = (seed) => {
    const session = createOpsSession({ seed });
    session.loadBaseline();
    session.tick();
    session.tick();
    return [...session._debug().openDisruptions.values()]
      .filter((item) => item.source === "ops")
      .map((item) => item.flightId)
      .sort();
  };
  assert.deepEqual(ids(123), ids(123));
});

test("reject leaves the flight disrupted with a new pending plan", () => {
  const session = createOpsSession({ seed: 3 });
  const snap = session.loadBaseline();
  const pending = snap.plans.find((plan) => plan.approvalStatus === "pending");
  assert.ok(pending);
  const after = session.decide(pending.flightId, "reject", "tester");
  assert.ok(after);
  const plan = after.plans.find((item) => item.flightId === pending.flightId);
  assert.ok(plan);
  assert.equal(plan.approvalStatus, "pending");
  assert.equal(plan.action, "hold_for_human_review");
  assert.equal(session._debug().openDisruptions.get(pending.flightId).status, "open");
});

test("accept freezes a commitment and keeps the plan approved across a tick", () => {
  const session = createOpsSession({ seed: 3 });
  const snap = session.loadBaseline();
  const pending = snap.plans.find((plan) => plan.approvalStatus === "pending");
  session.decide(pending.flightId, "accept", "tester");
  session.tick();
  const plan = session.snapshot().plans.find((item) => item.flightId === pending.flightId);
  assert.equal(plan.approvalStatus, "approved");
  assert.equal(session._debug().commitments.has(pending.flightId), true);
});

test("passenger impact emits a layer when a connecting group would miss", () => {
  const group = passengerGroups.find((item) => item.flightIds.length >= 2);
  assert.ok(group);
  const flight = networkIndex.flightById.get(group.flightIds[0]);
  assert.ok(flight);
  const layers = simulatePassengerImpact(flight, 24 * 60);
  assert.ok(layers.some((layer) => layer.kind === "passenger_group"));
  assert.ok(layers.every((layer) => layer.action === "rebook" || layer.action === "cancel_group"));
});

test("excludeTailIds blocks a competing reserve claim in buildComparison", () => {
  // Find a cancel that would try to swap when maintenance is tight — or force exclude on any delay swap path.
  const flight = flights.find((item) => item.status === "scheduled");
  assert.ok(flight);
  const withAll = buildComparison({ flight, action: "delay", delayMinutes: 90 });
  const exclude = new Set(withAll.deltas.aircraftSwapped ? [withAll.deltas.toAircraft.id] : ["N990SK", "N991SK", "N992SK", "N993SK", "N994SK"]);
  const blocked = buildComparison({ flight, action: "delay", delayMinutes: 90, excludeTailIds: exclude });
  if (withAll.deltas.aircraftSwapped) {
    assert.equal(blocked.deltas.aircraftSwapped, false);
  } else {
    // No swap needed for this leg; exclude still must not throw and must leave the original tail.
    assert.equal(blocked.deltas.toAircraft.id, flight.aircraftId);
  }
});
