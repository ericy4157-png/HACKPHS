/**
 * Live operational session: sim clock, open disruptions, commitments, and replan.
 */
import {
  OPS_SESSION_SEED,
  OPS_TICK_SIM_MINUTES,
  OPS_TICK_WALL_MS
} from "./aircraftPerformance.js";
import { networkIndex } from "./data.js";
import { createRng, maybeSpawnOpsNoise } from "./opsNoise.js";
import { SCENARIO_COUNT, buildBaselineSnapshot, buildOperationalSnapshot } from "./scenarios.js";
import { applyHubBankThinning, attachAlternatives } from "./recoveryCandidates.js";
import {
  buildDelayPlan,
  closedAirportsForEvent,
  maintenanceDisruptions
} from "./simulation.js";

const NOTICE = "Synthetic, benchmark-only operational picture. All recommendations require human review and do not execute flight operations.";

function summarize(plans) {
  return plans.reduce(
    (total, plan) => ({
      ...total,
      [plan.action]: (total[plan.action] || 0) + 1,
      passengersAffected: total.passengersAffected + plan.passengers
    }),
    { passengersAffected: 0 }
  );
}

function claimedTailFromPlan(plan) {
  if (!plan?.comparison?.deltas?.aircraftSwapped) return null;
  return plan.comparison.deltas.toAircraft?.id || null;
}

function sortOpen(openDisruptions) {
  return [...openDisruptions.values()]
    .filter((item) => item.status === "open")
    .map((item) => {
      const flight = networkIndex.flightById.get(item.flightId);
      return { item, flight, passengers: flight?.passengers ?? 0, dep: flight?.scheduledOffsetMinutes ?? 0 };
    })
    .filter(({ flight }) => flight)
    .sort((a, b) => b.passengers - a.passengers || a.dep - b.dep || a.item.flightId.localeCompare(b.item.flightId));
}

/**
 * @param {{ seed?: number }} [options]
 */
export function createOpsSession({ seed = OPS_SESSION_SEED } = {}) {
  let cycleStep = 0;
  let sessionEpochMs = Date.now();
  let simMinutes = 0;
  let lastTickAt = null;
  let planSeq = 0;
  let planRevision = 0;
  let lastOpsNote = null;
  let lastReplanReason = null;
  /** @type {string[]} */
  let lastChangedFlightIds = [];
  let rng = createRng(seed);
  /** @type {Map<string, object>} */
  let openDisruptions = new Map();
  /** @type {Map<string, object>} */
  let commitments = new Map();
  /** @type {Map<string, number>} */
  let rejectCounts = new Map();
  /** @type {object[]} */
  let plans = [];
  let meta = {
    baseline: true,
    refreshNumber: -1,
    scenario: "Normal operations",
    activeEvents: [],
    affectedAirports: [],
    mode: "synthetic_network_test_run",
    notice: NOTICE,
    refreshedAt: new Date().toISOString()
  };

  function nextPlanId(prefix) {
    planSeq += 1;
    return `PLAN-${prefix}-${simMinutes}-${planSeq}`;
  }

  function closedAirports() {
    const set = new Set();
    for (const event of meta.activeEvents) {
      for (const icao of closedAirportsForEvent(event)) set.add(icao);
    }
    return [...set];
  }

  function disasterSeverity() {
    if (meta.activeEvents.some((event) => event.severity === "severe")) return "severe";
    return meta.activeEvents[0]?.severity || "moderate";
  }

  function buildPlanFor(disruption, excludeTailIds) {
    const flight = networkIndex.flightById.get(disruption.flightId);
    if (!flight) return null;
    const rejects = rejectCounts.get(disruption.flightId) || 0;

    if (rejects > 0) {
      return buildDelayPlan(flight, {
        delayMinutes: disruption.delayMinutes || 90,
        reason: `Prior plan rejected for ${flight.id}; holding for manual recovery`,
        holdAfterReject: true,
        excludeTailIds
      });
    }

    // Seed plan for attachAlternatives(reselect); scoring picks the real primary.
    return buildDelayPlan(flight, {
      delayMinutes: disruption.delayMinutes || (disasterSeverity() === "severe" ? 240 : 90),
      reason: disruption.reason || "Recovery under evaluation",
      requiredChecks: disruption.source === "maintenance"
        ? ["Maintenance control releases the aircraft or confirms a swap", "Dispatcher validates crew duty and onward connections"]
        : undefined,
      excludeTailIds
    });
  }

  function fingerprint(plan) {
    return [
      plan.action,
      plan.plan?.estimatedDelayMinutes || 0,
      claimedTailFromPlan(plan) || "",
      (plan.layers || []).map((layer) => `${layer.kind}:${layer.flightId || ""}:${layer.action || ""}:${layer.delayMinutes || 0}`).join("|")
    ].join(";");
  }

  function replanAll(reason = "replan") {
    const exclude = new Set();
    for (const committed of commitments.values()) {
      const tail = claimedTailFromPlan(committed.plan);
      if (tail) exclude.add(tail);
    }

    const previousByFlight = new Map(plans.map((plan) => [plan.flightId, plan]));
    const nextPlans = [];
    const changed = [];

    for (const [flightId, committed] of commitments) {
      nextPlans.push({
        ...committed.plan,
        approvalStatus: "approved",
        decidedAt: committed.decidedAt,
        decidedBy: committed.decidedBy,
        planRevision,
        supersededReason: null
      });
      const disruption = openDisruptions.get(flightId);
      if (disruption) disruption.status = "resolved";
    }

    for (const { item } of sortOpen(openDisruptions)) {
      if (commitments.has(item.flightId)) continue;
      const plan = buildPlanFor(item, exclude);
      if (!plan) continue;

      const prev = previousByFlight.get(item.flightId);
      const id = prev?.approvalStatus === "pending" ? prev.id : nextPlanId(item.source[0].toUpperCase());
      const flight = networkIndex.flightById.get(item.flightId);
      const rejected = (rejectCounts.get(item.flightId) || 0) > 0;
      const recovered = attachAlternatives({
        ...plan,
        id,
        approvalStatus: "pending",
        planRevision,
        supersededReason: null
      }, {
        flight,
        closedAirports: closedAirports(),
        excludeTailIds: exclude,
        delayMinutes: item.delayMinutes,
        source: item.source || "ops",
        severity: item.severity || disasterSeverity(),
        forceAction: rejected ? "hold" : (item.forceAction || null),
        reason: item.reason,
        // After a reject, keep the hold seed — do not re-score back into the same delay.
        reselect: !rejected
      });

      let supersededReason = null;
      if (prev?.approvalStatus === "pending" && reason !== "scenario load") {
        if (fingerprint(prev) !== fingerprint(recovered)) {
          supersededReason = reason;
          changed.push(item.flightId);
        }
      }
      recovered.supersededReason = supersededReason;

      const claimed = claimedTailFromPlan(recovered);
      if (claimed) exclude.add(claimed);
      nextPlans.push(recovered);
    }

    plans = nextPlans;
    lastChangedFlightIds = changed;
    lastReplanReason = reason;
    meta.refreshedAt = new Date().toISOString();
  }

  function seedMeta(snapshot) {
    meta = {
      baseline: Boolean(snapshot.baseline),
      refreshNumber: snapshot.refreshNumber,
      scenario: snapshot.scenario,
      activeEvents: snapshot.activeEvents,
      affectedAirports: snapshot.affectedAirports,
      mode: snapshot.mode,
      notice: snapshot.notice || NOTICE,
      refreshedAt: new Date().toISOString()
    };
  }

  function resetClock() {
    sessionEpochMs = Date.now();
    simMinutes = 0;
    lastTickAt = null;
    planSeq = 0;
    planRevision = 0;
    lastOpsNote = null;
    lastReplanReason = null;
    lastChangedFlightIds = [];
  }

  function clearWork() {
    openDisruptions = new Map();
    commitments = new Map();
    rejectCounts = new Map();
    plans = [];
  }

  const session = {
    get cycleStep() {
      return cycleStep;
    },

    loadBaseline() {
      resetClock();
      clearWork();
      rng = createRng(seed + cycleStep * 1009);
      seedMeta(buildBaselineSnapshot());
      for (const item of maintenanceDisruptions()) openDisruptions.set(item.flightId, item);
      replanAll("scenario load");
      return session.snapshot();
    },

    loadDisaster(refreshNumber) {
      resetClock();
      clearWork();
      rng = createRng(seed + (refreshNumber + 1) * 1009);
      const snap = buildOperationalSnapshot(refreshNumber);
      seedMeta(snap);
      const closed = closedAirports();
      for (const plan of snap.plans) {
        openDisruptions.set(plan.flightId, {
          flightId: plan.flightId,
          source: "disaster",
          severity: disasterSeverity(),
          reason: plan.plan?.reason || "Disaster impact",
          delayMinutes: plan.plan?.estimatedDelayMinutes || 0,
          createdAtSim: 0,
          status: "open"
        });
      }
      applyHubBankThinning(openDisruptions, closed);
      replanAll("scenario load");
      return session.snapshot();
    },

    advanceScenario() {
      cycleStep = (cycleStep + 1) % (SCENARIO_COUNT + 1);
      return cycleStep === 0 ? session.loadBaseline() : session.loadDisaster(cycleStep - 1);
    },

    tick() {
      simMinutes += OPS_TICK_SIM_MINUTES;
      lastTickAt = new Date().toISOString();
      planRevision += 1;
      const { note } = maybeSpawnOpsNoise(openDisruptions, { rng, simMinutes });
      if (note) lastOpsNote = note;
      replanAll(note ? `ops noise: ${note}` : "clock tick");
      return session.snapshot();
    },

    decide(flightId, decision, decidedBy = "unattributed-operator", { planId } = {}) {
      const plan = plans.find((item) => item.flightId === flightId);
      if (!plan) return null;
      const decidedAt = new Date().toISOString();
      planRevision += 1;

      if (decision === "accept") {
        let chosen = plan;
        if (planId && planId !== plan.id) {
          const alt = (plan.alternatives || []).find((item) => item.id === planId);
          if (alt) chosen = alt;
        }
        const { alternatives: _alts, ...committed } = chosen;
        commitments.set(flightId, { plan: { ...committed, flightId }, decidedAt, decidedBy });
        const disruption = openDisruptions.get(flightId);
        if (disruption) disruption.status = "resolved";
        replanAll(`decision accepted on ${flightId}`);
      } else {
        commitments.delete(flightId);
        rejectCounts.set(flightId, (rejectCounts.get(flightId) || 0) + 1);
        const disruption = openDisruptions.get(flightId);
        if (disruption) disruption.status = "open";
        plans = plans.filter((item) => !(item.flightId === flightId && item.approvalStatus === "pending"));
        replanAll(`decision rejected on ${flightId}`);
      }
      return session.snapshot();
    },

    snapshot() {
      const simClockIso = new Date(sessionEpochMs + simMinutes * 60_000).toISOString();
      return {
        mode: meta.mode,
        refreshedAt: meta.refreshedAt || new Date().toISOString(),
        refreshNumber: meta.refreshNumber,
        baseline: meta.baseline,
        scenario: meta.scenario,
        activeEvents: meta.activeEvents,
        affectedAirports: meta.affectedAirports,
        plans,
        summary: summarize(plans),
        notice: meta.notice,
        simMinutes,
        simClockIso,
        tickSeconds: Math.round(OPS_TICK_WALL_MS / 1000),
        lastTickAt,
        lastOpsNote,
        planRevision,
        changedFlightIds: lastChangedFlightIds
      };
    },

    _debug() {
      return { openDisruptions, commitments, plans, simMinutes, rejectCounts, lastReplanReason };
    }
  };

  return session;
}
