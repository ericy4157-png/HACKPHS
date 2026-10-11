/**
 * Scored recovery futures: generate several legal plans, cost them on network pax-min
 * (including knock-on), apply tail-break and hub thinning, pick the best as primary.
 */
import {
  HUB_THIN_KEEP_FRACTION,
  PLANNER_CANCEL_PAX_WEIGHT,
  PLANNER_DELAY_STEPS_MINUTES,
  PLANNER_DIVERT_FLAT_COST,
  PLANNER_SWAP_FLAT_COST,
  PLANNER_TAIL_BREAK_DELAY_PENALTY,
  TAIL_BREAK_UNABSORBED_LEGS
} from "./aircraftPerformance.js";
import { networkIndex } from "./data.js";
import { HUBS } from "./networkPlan.js";
import {
  buildCancelPlan,
  buildDelayPlan,
  buildDisasterPlan,
  buildHoldPlan,
  buildReroutePlan,
  evaluateReroutes
} from "./simulation.js";

const HUB_ICAOS = new Set(HUBS.map((hub) => hub.icao));

/**
 * Passenger-delay cost on the disrupted leg + connecting-group layers.
 * Prefer networkCost() for ranking; this stays for labels.
 */
export function passengerMinutes(plan, flight) {
  const delay = Math.max(0, plan.comparison?.deltas?.arrivalChangeMinutes || plan.plan?.estimatedDelayMinutes || 0);
  let total = (flight?.passengers || plan.passengers || 0) * delay;
  if (plan.action === "cancel") {
    total = (flight?.passengers || plan.passengers || 0) * PLANNER_CANCEL_PAX_WEIGHT;
  }
  for (const layer of plan.layers || []) {
    if (layer.kind === "passenger_group" && layer.size) {
      if (layer.action === "cancel_group") total += layer.size * PLANNER_CANCEL_PAX_WEIGHT;
      else total += layer.size * (layer.delayMinutes || 0);
    }
  }
  return Math.round(total);
}

/** Unabsorbed later legs on the same tail (delay never clears). */
export function unabsorbedKnockOnCount(plan) {
  return (plan.layers || []).filter(
    (layer) => layer.kind === "aircraft_knock_on" && !layer.absorbed && (layer.delayMinutes || 0) > 0
  ).length;
}

/**
 * Network-wide cost: disrupted pax + knock-on leg pax × delay + cancel/misconnect weights + flat prefs.
 */
export function networkCost(plan, flight) {
  let cost = passengerMinutes(plan, flight);

  for (const layer of plan.layers || []) {
    if (layer.kind !== "aircraft_knock_on" || layer.absorbed || !layer.flightId) continue;
    const leg = networkIndex.flightById.get(layer.flightId);
    if (leg) cost += (leg.passengers || 0) * (layer.delayMinutes || 0);
  }

  if (plan.comparison?.deltas?.aircraftSwapped) cost += PLANNER_SWAP_FLAT_COST;
  if (plan.action === "reroute") cost += PLANNER_DIVERT_FLAT_COST;

  const knockOns = unabsorbedKnockOnCount(plan);
  if (knockOns >= TAIL_BREAK_UNABSORBED_LEGS && plan.action === "delay" && !plan.comparison?.deltas?.aircraftSwapped) {
    cost += PLANNER_TAIL_BREAK_DELAY_PENALTY * (knockOns - TAIL_BREAK_UNABSORBED_LEGS + 1);
  }

  return Math.round(cost);
}

/** One-line rail label, e.g. "Delay 45m · 12,400 pax-min". */
export function candidateLabel(plan, flight) {
  const cost = networkCost(plan, flight);
  const pax = `${cost.toLocaleString("en-US")} pax-min`;
  const knockOns = unabsorbedKnockOnCount(plan);
  const rotNote = knockOns >= TAIL_BREAK_UNABSORBED_LEGS && plan.action === "delay" && !plan.comparison?.deltas?.aircraftSwapped
    ? " · rotation does not recover"
    : "";

  if (plan.action === "delay") {
    const mins = plan.plan?.estimatedDelayMinutes || plan.comparison?.deltas?.arrivalChangeMinutes || 0;
    const swap = plan.comparison?.deltas?.aircraftSwapped ? ` · swap ${plan.comparison.deltas.toAircraft.id}` : "";
    return `Delay ${mins}m${swap} · ${pax}${rotNote}`;
  }
  if (plan.action === "reroute") {
    const dest = plan.plan?.diversionAirport || "";
    const swap = plan.comparison?.deltas?.aircraftSwapped ? " · swap" : "";
    return `Divert ${dest}${swap} · ${pax}`;
  }
  if (plan.action === "cancel") {
    const protect = /rotation|hub bank|thin/i.test(plan.plan?.reason || "") ? " · protect network" : "";
    return `Cancel & rebook${protect} · ${pax}`;
  }
  return `Manual review · ${pax}`;
}

function planKey(plan) {
  return [
    plan.action,
    plan.plan?.estimatedDelayMinutes || 0,
    plan.plan?.diversionAirport || "",
    plan.comparison?.deltas?.toAircraft?.id || plan.aircraft || "",
    plan.plan?.forceSwap ? "fs" : ""
  ].join("|");
}

function decorate(plan, flight) {
  const cost = networkCost(plan, flight);
  return {
    ...plan,
    approvalStatus: "pending",
    passengerMinutes: cost,
    label: candidateLabel(plan, flight),
    networkCost: cost,
    unabsorbedKnockOns: unabsorbedKnockOnCount(plan)
  };
}

function isFuelSafe(plan) {
  if (plan.action !== "reroute") return true;
  const margin = plan.plan?.reroute?.operationalAssessment?.fuelMarginMinutes;
  return margin == null || margin >= 0;
}

function delayStepsFor({ delayMinutes, source, severity }) {
  const steps = new Set(PLANNER_DELAY_STEPS_MINUTES);
  if (delayMinutes) steps.add(Math.round(delayMinutes));
  if (source === "disaster") {
    steps.add(severity === "severe" ? 240 : 90);
  }
  return [...steps].filter((n) => n > 0).sort((a, b) => a - b);
}

/**
 * Legal futures for one disrupted flight (typically 4–6).
 */
export function generateFutures(flight, {
  closedAirports = [],
  excludeTailIds = new Set(),
  delayMinutes,
  source = "ops",
  severity = "moderate",
  forceAction = null,
  reason = null
} = {}) {
  if (!flight) return [];
  const futures = [];
  const seen = new Set();

  const push = (plan) => {
    if (!plan || !isFuelSafe(plan)) return;
    const key = planKey(plan);
    if (seen.has(key)) return;
    seen.add(key);
    futures.push(plan);
  };

  if (forceAction === "cancel" && flight.status !== "airborne") {
    push(buildCancelPlan(flight, closedAirports, {
      reason: "Hub bank thinning: lower-pax spoke cancelled so higher-pax flights can recover",
      excludeTailIds
    }));
    push(buildHoldPlan(flight, { reason: `Holding ${flight.id} after hub thinning for dispatcher review`, excludeTailIds }));
    return futures;
  }

  if (forceAction === "hold") {
    push(buildHoldPlan(flight, { reason: `Holding ${flight.id} for human recovery`, excludeTailIds }));
    return futures;
  }

  // Disaster default path (may cancel / divert / delay by airport impact).
  if (source === "disaster") {
    push(buildDisasterPlan(flight, closedAirports, severity, { excludeTailIds }));
  }

  for (const mins of delayStepsFor({ delayMinutes, source, severity })) {
    push(buildDelayPlan(flight, {
      delayMinutes: mins,
      reason: reason
        || (source === "disaster" ? "Origin or destination operating below capacity" : `Operational delay (${mins} min)`),
      excludeTailIds
    }));
  }

  // Probe whether a same-tail delay would poison the rotation.
  const probeMins = delayMinutes || (severity === "severe" ? 90 : 45);
  const probe = buildDelayPlan(flight, {
    delayMinutes: probeMins,
    reason: "probe",
    excludeTailIds
  });
  const badCascade = unabsorbedKnockOnCount(probe) >= TAIL_BREAK_UNABSORBED_LEGS;
  const protectRotation = source === "disaster" || source === "maintenance" || badCascade;

  // Tail-break / protection: spare swap or cancel — not for routine short ops holds unless the cascade is real.
  if (flight.status !== "airborne" && protectRotation) {
    push(buildDelayPlan(flight, {
      delayMinutes: probeMins,
      reason: `Protect ${flight.aircraftId} rotation with a spare on ${flight.id}`,
      excludeTailIds,
      forceSwap: true
    }));
    push(buildCancelPlan(flight, closedAirports, {
      reason: `Cancel ${flight.id} to stop knock-on down ${flight.aircraftId}'s later trips`,
      excludeTailIds
    }));
  }

  const destClosed = closedAirports.includes(flight.destination);
  if (destClosed || flight.status === "airborne") {
    const { safe, fuelChecks } = evaluateReroutes(flight, closedAirports);
    for (const item of safe.slice(0, 2)) {
      push(buildReroutePlan(flight, closedAirports, { ...item, fuelChecks, excludeTailIds }));
    }
  }

  if (!futures.length) {
    push(buildHoldPlan(flight, { reason: `No legal recovery found for ${flight.id}`, excludeTailIds }));
  }

  return futures;
}

/**
 * Rank futures by network cost (lower better). Deterministic ties.
 */
export function rankFutures(futures, flight) {
  return futures
    .map((plan) => {
      const decorated = decorate(plan, flight);
      return { plan: decorated, cost: decorated.networkCost };
    })
    .sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      const order = { cancel: 0, reroute: 1, delay: 2, hold_for_human_review: 3 };
      const ao = order[a.plan.action] ?? 9;
      const bo = order[b.plan.action] ?? 9;
      if (ao !== bo) return ao - bo;
      return (a.plan.plan?.estimatedDelayMinutes || 0) - (b.plan.plan?.estimatedDelayMinutes || 0);
    });
}

/**
 * Pick best primary + up to two alternatives.
 */
export function selectBestRecovery(flight, context = {}) {
  const futures = generateFutures(flight, context);
  const ranked = rankFutures(futures, flight);
  if (!ranked.length) {
    const hold = decorate(buildHoldPlan(flight, { reason: `Holding ${flight.id}` }), flight);
    return { ...hold, alternatives: [] };
  }
  const primary = ranked[0].plan;
  const alternatives = ranked.slice(1, 3).map((item, index) => ({
    ...item.plan,
    id: undefined // stamped by caller
  }));
  return { ...primary, alternatives };
}

/**
 * Up to two sibling plans that differ from `primary` (legacy helper for tests).
 */
export function buildAlternatives(primary, context = {}) {
  const flight = context.flight || networkIndex.flightById.get(primary?.flightId);
  if (!primary || !flight) return [];
  const ranked = rankFutures(generateFutures(flight, {
    ...context,
    delayMinutes: context.delayMinutes || primary.plan?.estimatedDelayMinutes
  }), flight);
  const primaryKey = planKey(primary);
  return ranked
    .map((item) => item.plan)
    .filter((plan) => planKey(plan) !== primaryKey)
    .slice(0, 2);
}

/**
 * Stamp costs on primary and attach next-best alternatives.
 * When `reselect` is true (default for session), primary is replaced by the best scored future.
 */
export function attachAlternatives(primary, context = {}) {
  const flight = context.flight || networkIndex.flightById.get(primary.flightId);
  if (context.reselect === false) {
    const decorated = decorate(primary, flight);
    const alternatives = buildAlternatives(primary, { ...context, flight }).map((alt, index) => ({
      ...alt,
      id: `${primary.id}-A${index + 1}`
    }));
    return { ...decorated, alternatives };
  }

  const best = selectBestRecovery(flight, {
    closedAirports: context.closedAirports || [],
    excludeTailIds: context.excludeTailIds || new Set(),
    delayMinutes: context.delayMinutes || primary.plan?.estimatedDelayMinutes,
    source: context.source || "ops",
    severity: context.severity || "moderate",
    forceAction: context.forceAction || null,
    reason: context.reason || primary.plan?.reason
  });

  const alternatives = (best.alternatives || []).map((alt, index) => ({
    ...alt,
    id: `${primary.id || "PLAN"}-A${index + 1}`
  }));

  return {
    ...best,
    id: primary.id,
    alternatives,
    approvalStatus: "pending"
  };
}

/**
 * Among open disruptions at affected hubs, mark the lowest-pax spokes for cancel (hub bank thinning).
 * Mutates disruption objects: sets forceAction = "cancel".
 */
export function applyHubBankThinning(openDisruptions, closedAirports = [], { keepFraction = HUB_THIN_KEEP_FRACTION } = {}) {
  if (!closedAirports.length) return [];
  const closed = new Set(closedAirports);
  const thinned = [];

  for (const hub of HUB_ICAOS) {
    if (!closed.has(hub)) continue;
    const spokes = [];
    for (const disruption of openDisruptions.values()) {
      if (disruption.status !== "open" || disruption.source !== "disaster") continue;
      const flight = networkIndex.flightById.get(disruption.flightId);
      if (!flight || flight.status === "airborne") continue;
      if (flight.origin !== hub && flight.destination !== hub) continue;
      // Only thin flights that would otherwise be delayed (origin open enough to depart, or dest soft).
      spokes.push({ disruption, flight, passengers: flight.passengers || 0 });
    }
    if (spokes.length < 3) continue;

    spokes.sort((a, b) => a.passengers - b.passengers || a.flight.id.localeCompare(b.flight.id));
    const keep = Math.max(1, Math.ceil(spokes.length * keepFraction));
    const cancelCount = spokes.length - keep;
    for (let i = 0; i < cancelCount; i += 1) {
      const { disruption, flight } = spokes[i];
      // Do not override severe origin-closed cancels already preferred; still mark for scoring.
      if (flight.origin === hub && closed.has(hub)) {
        // Origin closed severe → already cancel; thinning is redundant but harmless.
      }
      disruption.forceAction = "cancel";
      disruption.reason = `Hub bank thinning at ${hub}: lower-pax ${flight.id} cancelled to protect the bank`;
      thinned.push(flight.id);
    }
  }

  return thinned;
}
