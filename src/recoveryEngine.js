/**
 * Recovery engine — aircraft knock-on, passenger connection layers, and plan layer assembly.
 *
 * Design: docs/recovery-engine.md. Beam search is deferred; this pass is greedy layers + claims.
 */
import { fleet, networkIndex } from "./data.js";
import { TYPE_PERFORMANCE } from "./aircraftPerformance.js";

export const DEFAULT_MAX_LOOKAHEAD_LEGS = 20;

/**
 * Simulate how `delayMinutes` on `flight` knocks on to later legs of the same tail.
 * Returns layer objects (index ≥ 1) suitable for attaching to a plan's `layers` array.
 *
 * @param {object} flight disrupted leg (must have aircraftId, id, arrivalOffsetMinutes)
 * @param {number} delayMinutes extra minutes on the disrupted leg's arrival
 * @param {{ maxLegs?: number }} [options]
 */
export function simulateAircraftKnockOn(flight, delayMinutes, { maxLegs = DEFAULT_MAX_LOOKAHEAD_LEGS } = {}) {
  if (!flight?.aircraftId || !Number.isFinite(delayMinutes) || delayMinutes <= 0) return [];

  const legs = networkIndex.legsByTail.get(flight.aircraftId) || [];
  const start = legs.findIndex((leg) => leg.id === flight.id);
  if (start < 0) return [];

  const layers = [];
  let remainingDelay = Math.round(delayMinutes);

  for (let i = start + 1; i < legs.length && layers.length < maxLegs; i += 1) {
    const previous = legs[i - 1];
    const leg = legs[i];
    const scheduledGround = leg.scheduledOffsetMinutes - previous.arrivalOffsetMinutes;
    const turnNeeded = leg.turnBeforeMinutes ?? 0;
    // Spare buffer in the base schedule that can soak up incoming delay.
    const buffer = Math.max(0, scheduledGround - turnNeeded);
    const knockOn = Math.max(0, remainingDelay - buffer);
    const absorbed = knockOn === 0;

    layers.push({
      index: layers.length + 1,
      kind: "aircraft_knock_on",
      flightId: leg.id,
      aircraftId: flight.aircraftId,
      delayMinutes: knockOn,
      absorbed,
      summary: absorbed
        ? `${flight.aircraftId} delay absorbed before ${leg.id} by a ${buffer} min turn buffer.`
        : `${leg.id} departs ${knockOn} min late (${buffer} min of ${remainingDelay} min delay absorbed).`
    });

    if (absorbed) break;
    remainingDelay = knockOn;
  }

  return layers;
}

/**
 * Leftover seats on a leg after local load (simplified: type seats − passengers).
 */
function leftoverSeats(leg) {
  const seats = TYPE_PERFORMANCE[leg.aircraft]?.seats
    ?? fleet.find((item) => item.id === leg.aircraftId)?.seats
    ?? 180;
  return Math.max(0, seats - (leg.passengers || 0));
}

/**
 * Earliest later departure from `airport` to `destination` with seat room after `afterOffset`.
 */
function findRebook(airport, destination, afterOffset, size, excludeFlightId) {
  const departures = networkIndex.departuresByAirport.get(airport) || [];
  return departures.find((leg) => {
    if (leg.id === excludeFlightId) return false;
    if (leg.destination !== destination) return false;
    if (leg.scheduledOffsetMinutes <= afterOffset) return false;
    return leftoverSeats(leg) >= size;
  }) || null;
}

/**
 * Passenger itinerary consequences of a delay on `flight`.
 * Multi-leg groups: check connection; on miss, try deterministic rebook or mark cancelled.
 */
export function simulatePassengerImpact(flight, delayMinutes) {
  if (!flight?.id || !Number.isFinite(delayMinutes) || delayMinutes < 0) return [];

  const groups = networkIndex.groupsByFlight.get(flight.id) || [];
  const layers = [];
  const newArrival = flight.arrivalOffsetMinutes + Math.round(delayMinutes);

  for (const group of groups) {
    const legIndex = group.flightIds.indexOf(flight.id);
    if (legIndex < 0 || legIndex >= group.flightIds.length - 1) continue;

    const nextId = group.flightIds[legIndex + 1];
    const nextFlight = networkIndex.flightById.get(nextId);
    if (!nextFlight) continue;

    const connection = group.connections?.[legIndex];
    const minConn = connection?.minimumMinutes ?? 60;
    const gap = nextFlight.scheduledOffsetMinutes - newArrival;

    // On-time connections stay silent; only missed connections become layers.
    if (gap >= minConn) continue;

    const rebook = findRebook(
      nextFlight.origin,
      group.finalDestination || nextFlight.destination,
      newArrival + minConn,
      group.size,
      nextId
    );

    if (rebook) {
      const extra = rebook.scheduledOffsetMinutes - nextFlight.scheduledOffsetMinutes;
      layers.push({
        kind: "passenger_group",
        groupId: group.id,
        size: group.size,
        flightId: rebook.id,
        action: "rebook",
        delayMinutes: Math.max(0, extra),
        summary: `${group.size} pax miss ${nextId} at ${nextFlight.origin}; rebooked on ${rebook.id} (+${Math.max(0, extra)}m).`
      });
    } else {
      layers.push({
        kind: "passenger_group",
        groupId: group.id,
        size: group.size,
        flightId: nextId,
        action: "cancel_group",
        delayMinutes: 0,
        summary: `${group.size} pax miss ${nextId}; no later seat to ${group.finalDestination || nextFlight.destination} in the model.`
      });
    }
  }

  return layers;
}

/**
 * Build the full `layers` array for a plan: layer 0 is the disrupted leg, then knock-on and passenger layers.
 */
export function buildPlanLayers({ flight, action, delayMinutes = 0, summary, skipKnockOn = false }) {
  const layer0 = {
    index: 0,
    kind: "disrupted_leg",
    flightId: flight.id,
    action,
    delayMinutes: Math.max(0, Math.round(delayMinutes)),
    aircraftId: flight.aircraftId,
    summary: summary || `${flight.id}: ${action}`
  };

  if (action === "cancel") {
    const pax = simulatePassengerImpact(flight, 18 * 60).map((layer, i) => ({ ...layer, index: i + 1 }));
    return [layer0, ...pax];
  }

  const knockOn = skipKnockOn ? [] : simulateAircraftKnockOn(flight, delayMinutes);
  const passenger = simulatePassengerImpact(flight, delayMinutes);

  // Also check passengers on knock-on legs that still carry delay.
  const knockOnPax = [];
  for (const layer of knockOn) {
    if (layer.absorbed || !layer.delayMinutes) continue;
    const leg = networkIndex.flightById.get(layer.flightId);
    if (!leg) continue;
    knockOnPax.push(...simulatePassengerImpact(leg, layer.delayMinutes));
  }

  const rest = [...knockOn, ...passenger, ...knockOnPax].map((layer, i) => ({ ...layer, index: i + 1 }));
  return [layer0, ...rest];
}

/**
 * Flight ids linked to a plan via aircraft knock-on or passenger rebook/miss layers.
 */
export function linkedFlightIds(plan) {
  const ids = new Set();
  for (const layer of plan.layers || []) {
    if (layer.flightId && layer.flightId !== plan.flightId) ids.add(layer.flightId);
    if (layer.kind === "passenger_group" && layer.action !== "keep_connection") {
      // Missed connection target is still relevant context.
      if (layer.flightId) ids.add(layer.flightId);
    }
  }
  return ids;
}
