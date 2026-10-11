/**
 * Legal sibling futures for a pending recovery plan.
 * Primary action is never rewritten here; alternatives are additive and stay pending.
 */
import { networkIndex } from "./data.js";
import { buildDelayPlan, buildHoldPlan, buildReroutePlan, evaluateReroutes } from "./simulation.js";

/**
 * Passenger-delay cost used to compare futures. Connecting groups add size × delay.
 */
export function passengerMinutes(plan, flight) {
  const delay = Math.max(0, plan.comparison?.deltas?.arrivalChangeMinutes || plan.plan?.estimatedDelayMinutes || 0);
  let total = (flight?.passengers || plan.passengers || 0) * delay;
  for (const layer of plan.layers || []) {
    if (layer.kind === "passenger_group" && layer.size) {
      total += layer.size * (layer.delayMinutes || 0);
    }
  }
  return Math.round(total);
}

/** One-line rail label, e.g. "Delay 45m · 12,400 pax-min". */
export function candidateLabel(plan, flight) {
  const pax = `${passengerMinutes(plan, flight).toLocaleString("en-US")} pax-min`;
  if (plan.action === "delay") {
    const mins = plan.plan?.estimatedDelayMinutes || plan.comparison?.deltas?.arrivalChangeMinutes || 0;
    const swap = plan.comparison?.deltas?.aircraftSwapped ? ` · swap ${plan.comparison.deltas.toAircraft.id}` : "";
    return `Delay ${mins}m${swap} · ${pax}`;
  }
  if (plan.action === "reroute") {
    const dest = plan.plan?.diversionAirport || "";
    const swap = plan.comparison?.deltas?.aircraftSwapped ? " · swap" : "";
    return `Divert ${dest}${swap} · ${pax}`;
  }
  if (plan.action === "cancel") return `Cancel & rebook · ${pax}`;
  return `Manual review · ${pax}`;
}

function planKey(plan) {
  return [
    plan.action,
    plan.plan?.estimatedDelayMinutes || 0,
    plan.plan?.diversionAirport || "",
    plan.comparison?.deltas?.toAircraft?.id || plan.aircraft || ""
  ].join("|");
}

function decorate(plan, flight) {
  return {
    ...plan,
    approvalStatus: "pending",
    passengerMinutes: passengerMinutes(plan, flight),
    label: candidateLabel(plan, flight)
  };
}

function isFuelSafe(plan) {
  if (plan.action !== "reroute") return true;
  const margin = plan.plan?.reroute?.operationalAssessment?.fuelMarginMinutes;
  return margin == null || margin >= 0;
}

/**
 * Up to two sibling plans that differ from `primary`. Never invents an illegal divert or swap.
 */
export function buildAlternatives(primary, { flight, closedAirports = [], excludeTailIds = new Set(), delayMinutes } = {}) {
  if (!primary || !flight) return [];
  const seen = new Set([planKey(primary)]);
  const out = [];

  const push = (plan) => {
    if (!plan || out.length >= 2) return;
    if (!isFuelSafe(plan)) return;
    const key = planKey(plan);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(decorate(plan, flight));
  };

  if (primary.action === "reroute") {
    const { safe, fuelChecks } = evaluateReroutes(flight, closedAirports);
    const primaryDest = primary.plan?.diversionAirport;
    const next = safe.find((item) => item.alternate.icao !== primaryDest);
    if (next) push(buildReroutePlan(flight, closedAirports, { ...next, fuelChecks, excludeTailIds }));
  }

  if (primary.action === "delay") {
    const primaryDelay = primary.plan?.estimatedDelayMinutes || delayMinutes || 90;
    if (primaryDelay > 45) {
      push(buildDelayPlan(flight, {
        delayMinutes: 45,
        reason: primary.plan?.reason || "Shorter recovery delay",
        requiredChecks: primary.requiredChecks,
        excludeTailIds
      }));
    }
  }

  if (primary.comparison?.deltas?.aircraftSwapped) {
    const swapId = primary.comparison.deltas.toAircraft?.id;
    const blocked = new Set([...excludeTailIds, swapId].filter(Boolean));
    if (primary.action === "delay") {
      push(buildDelayPlan(flight, {
        delayMinutes: primary.plan?.estimatedDelayMinutes || delayMinutes || 90,
        reason: primary.plan?.reason,
        requiredChecks: primary.requiredChecks,
        excludeTailIds: blocked
      }));
    }
    if (primary.action === "reroute" && primary.plan?.diversionAirport) {
      const { safe, fuelChecks } = evaluateReroutes(flight, closedAirports);
      const same = safe.find((item) => item.alternate.icao === primary.plan.diversionAirport);
      if (same) push(buildReroutePlan(flight, closedAirports, { ...same, fuelChecks, excludeTailIds: blocked }));
    }
  }

  if (out.length === 0 && primary.action !== "hold_for_human_review") {
    push(buildHoldPlan(flight, {
      reason: `Holding ${flight.id} for a dispatcher to pick a recovery`,
      excludeTailIds
    }));
  }

  return out;
}

/**
 * Stamp passenger cost on the primary and attach 1–2 legal alternatives with their own ids.
 */
export function attachAlternatives(primary, context = {}) {
  const flight = context.flight || networkIndex.flightById.get(primary.flightId);
  const decorated = decorate(primary, flight);
  const alternatives = buildAlternatives(primary, { ...context, flight }).map((alt, index) => ({
    ...alt,
    id: `${primary.id}-A${index + 1}`
  }));
  return { ...decorated, alternatives };
}
