import { airports, fleet, flights, networkIndex } from "./data.js";
import { buildComparison } from "./comparison.js";
import { buildPlanLayers } from "./recoveryEngine.js";
import { BASELINE_MAINTENANCE_TAILS, UNSCHEDULED_MAINTENANCE_DELAY_MINUTES } from "./aircraftPerformance.js";
import { distanceNm, diversionOptions, planReroute } from "./routing.js";

const airport = (icao) => networkIndex.airportByIcao.get(icao);
const nowIso = (offsetMinutes) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

function affectedAirportCodes({ center, radiusNm }) {
  return airports.filter((item) => distanceNm(center, item) <= radiusNm).map((item) => item.icao);
}

function flightImpact(flight, closedAirports, severity) {
  const destinationClosed = closedAirports.includes(flight.destination);
  const originClosed = closedAirports.includes(flight.origin);
  if (!originClosed && !destinationClosed) return null;
  if (flight.status === "airborne" && destinationClosed) return "reroute";
  if (originClosed && severity === "severe") return "cancel";
  return "delay";
}

/** A reroute to `destination`, or the reason none can be built; one bad alternate must not stop the others. */
function rerouteOrError(flight, destination, closedAirports) {
  try {
    return { reroute: planReroute({ flight, destination, closedAirports, policy: { avoidHighTerrain: true } }) };
  } catch (error) {
    return { reroute: null, error: error.message };
  }
}

function standardFields(flight, action) {
  return {
    flightId: flight.id,
    callsign: flight.callsign,
    aircraft: flight.aircraftId,
    passengers: flight.passengers,
    action,
    approvalStatus: "pending",
    generatedAt: new Date().toISOString(),
    routeContext: {
      origin: airport(flight.origin),
      originalDestination: airport(flight.destination),
      currentPosition: flight.position || airport(flight.origin)
    },
    requiredChecks: [
      "Dispatcher validates NOTAM, weather, ETOPS/performance, crew duty and traffic-flow constraints",
      "ATC and airport operations acceptance required before execution"
    ]
  };
}

/**
 * Ranked diversion attempts for a flight, including fuel-unsafe ones so callers can explain a hold.
 */
export function evaluateReroutes(flight, closedAirports) {
  const currentPosition = flight.position || airport(flight.origin);
  const alternates = diversionOptions(currentPosition, flight.aircraft, closedAirports, airport(flight.destination));
  const evaluated = alternates.map((alternate) => ({ alternate, ...rerouteOrError(flight, alternate.icao, closedAirports) }));
  const fuelChecks = evaluated.map(({ alternate, reroute, error }) => (reroute
    ? { airport: alternate.icao, fuelMarginMinutes: reroute.operationalAssessment.fuelMarginMinutes }
    : { airport: alternate.icao, fuelMarginMinutes: null, error }));
  const safe = evaluated.filter(({ reroute }) => reroute && reroute.operationalAssessment.fuelMarginMinutes >= 0);
  return { alternates, evaluated, fuelChecks, safe };
}

/** One finished reroute plan to a fuel-safe alternate. */
export function buildReroutePlan(flight, closedAirports, { alternate, reroute, fuelChecks = [], excludeTailIds = new Set() } = {}) {
  const aircraft = fleet.find((item) => item.id === flight.aircraftId);
  const destination = alternate.icao;
  return finish(flight, closedAirports, {
    ...standardFields(flight, "reroute"),
    plan: {
      reason: `Destination ${flight.destination} unavailable`,
      diversionAirport: destination,
      diversionRunwayCheck: alternate.runwayCheck,
      alternateFuelChecks: fuelChecks,
      reroute,
      fuelAndRamp: `Confirm landing fuel reserve; arrange fuel, gate and handling at ${destination}`,
      maintenance: aircraft.maintenanceDueInHours < 8
        ? "Maintenance control approval required at diversion"
        : `Maintenance check remains due in ${aircraft.maintenanceDueInHours} flight hours`,
      onwardRecovery: `Protect passengers and evaluate recovery service to ${flight.destination}`
    }
  }, { excludeTailIds });
}

/** Hold for a dispatcher. Always pending; nothing is sent. */
export function buildHoldPlan(flight, { reason, requiredChecks, excludeTailIds = new Set() } = {}) {
  return finish(flight, [], {
    ...standardFields(flight, "hold_for_human_review"),
    requiredChecks: requiredChecks || ["Prior recovery plan was rejected; dispatcher builds a manual option"],
    plan: { reason: reason || `Holding ${flight.id} for human recovery` }
  }, { excludeTailIds });
}

function detailedPlan(flight, closedAirports, severity, { excludeTailIds = new Set() } = {}) {
  const aircraft = fleet.find((item) => item.id === flight.aircraftId);
  const action = flightImpact(flight, closedAirports, severity);
  if (!action) return null;
  const opts = { excludeTailIds };
  if (action === "cancel") {
    return finish(flight, closedAirports, {
      ...standardFields(flight, "cancel"),
      plan: {
        reason: "Departure airport unavailable during severe disruption",
        passengerRecovery: "Rebook to next available protected itinerary",
        aircraftAction: "Hold at origin; await ramp and maintenance release"
      }
    }, opts);
  }
  if (action === "delay") {
    const delayMinutes = severity === "severe" ? 240 : 90;
    return finish(flight, closedAirports, {
      ...standardFields(flight, "delay"),
      plan: {
        reason: "Origin or destination operating below capacity",
        estimatedDelayMinutes: delayMinutes,
        fuelAndRamp: `Fuel uplift after gate assignment; minimum turnaround ${aircraft.minimumTurnMinutes} min`,
        maintenance: aircraft.maintenanceDueInHours < 8
          ? "Maintenance check required before next rotation"
          : `Maintenance due in ${aircraft.maintenanceDueInHours} flight hours`,
        revisedDeparture: nowIso(flight.scheduledOffsetMinutes + delayMinutes)
      }
    }, opts);
  }
  const { alternates, fuelChecks, safe } = evaluateReroutes(flight, closedAirports);
  if (!alternates.length) {
    return finish(flight, closedAirports, {
      ...standardFields(flight, "hold_for_human_review"),
      plan: { reason: "No compliant diversion airport found in modeled network" }
    }, opts);
  }
  const chosen = safe[0];
  if (!chosen) {
    const margins = fuelChecks.map((check) => (check.error ? `${check.airport} no route` : `${check.airport} ${check.fuelMarginMinutes} min`)).join(", ");
    return finish(flight, closedAirports, {
      ...standardFields(flight, "hold_for_human_review"),
      plan: { reason: `Destination ${flight.destination} unavailable and no alternate meets the fuel reserve (fuel margin: ${margins})`, alternateFuelChecks: fuelChecks }
    }, opts);
  }
  return buildReroutePlan(flight, closedAirports, { ...chosen, fuelChecks, excludeTailIds });
}

export function finish(flight, closedAirports, plan, { excludeTailIds = new Set() } = {}) {
  const comparison = buildComparison({
    flight,
    action: plan.action,
    delayMinutes: plan.plan.estimatedDelayMinutes || 0,
    diversionAirport: plan.plan.diversionAirport,
    reroute: plan.plan.reroute,
    closedAirports,
    excludeTailIds
  });
  plan.plan.changeSummary = { timing: comparison.deltas.timing, aircraft: comparison.deltas.aircraft, layover: comparison.deltas.layover };
  const arrivalDelay = Math.max(0, comparison.deltas.arrivalChangeMinutes || plan.plan.estimatedDelayMinutes || 0);
  const layers = buildPlanLayers({
    flight,
    action: plan.action,
    delayMinutes: arrivalDelay,
    summary: plan.plan.reason || `${flight.id}: ${plan.action}`
  });
  return { ...plan, comparison, layers };
}

/**
 * Delay / hold plan for ops or maintenance disruptions (no airport closure).
 * When `holdAfterReject` is set, emit hold_for_human_review instead of another delay.
 */
export function buildDelayPlan(flight, { delayMinutes, reason, requiredChecks, excludeTailIds = new Set(), holdAfterReject = false } = {}) {
  const aircraft = fleet.find((item) => item.id === flight.aircraftId);
  if (holdAfterReject) {
    return buildHoldPlan(flight, { reason: reason || `Prior plan rejected for ${flight.id}; holding for human recovery`, requiredChecks, excludeTailIds });
  }
  return finish(flight, [], {
    ...standardFields(flight, "delay"),
    requiredChecks: requiredChecks || [
      "Dispatcher validates NOTAM, weather, ETOPS/performance, crew duty and traffic-flow constraints",
      "ATC and airport operations acceptance required before execution"
    ],
    plan: {
      reason,
      estimatedDelayMinutes: delayMinutes,
      fuelAndRamp: `Fuel uplift after gate assignment; minimum turnaround ${aircraft.minimumTurnMinutes} min`,
      maintenance: aircraft.maintenanceDueInHours < 8 ? "Maintenance check required before next rotation" : `Maintenance due in ${aircraft.maintenanceDueInHours} flight hours`,
      revisedDeparture: nowIso(flight.scheduledOffsetMinutes + delayMinutes)
    }
  }, { excludeTailIds });
}

/** Disaster impact plan for one flight, or null when unaffected. */
export function buildDisasterPlan(flight, closedAirports, severity, { excludeTailIds = new Set() } = {}) {
  return detailedPlan(flight, closedAirports, severity, { excludeTailIds });
}

/** Closed airport ICAOs for a disaster event center. */
export function closedAirportsForEvent(event) {
  const centerAirport = event.airport ? airport(event.airport) : null;
  const center = event.center || centerAirport;
  if (!center?.lat || !center?.lon) return [];
  return affectedAirportCodes({ center, radiusNm: Number(event.radiusNm || 120) });
}

export const DEFAULT_WINDOW_HOURS = 24;

/**
 * Legs an event can affect: airborne legs, plus scheduled legs departing before the window closes.
 * The window is how long the event lasts; it is not the recovery engine's lookahead depth.
 */
export function flightsInWindow(windowHours = DEFAULT_WINDOW_HOURS) {
  return flights.filter((flight) => flight.status === "airborne" || flight.scheduledOffsetMinutes < windowHours * 60);
}

/**
 * A normal day with no disaster: the tails closest to a maintenance limit each have an unscheduled
 * snag on their next departure in the window. Deterministic for a given network.
 */
export function simulateMaintenanceIssues({ tails = BASELINE_MAINTENANCE_TAILS, windowHours = DEFAULT_WINDOW_HOURS } = {}) {
  const delayMinutes = UNSCHEDULED_MAINTENANCE_DELAY_MINUTES;
  const candidates = flightsInWindow(windowHours).filter((flight) => flight.status !== "airborne");
  const nextLegByTail = new Map();
  for (const flight of [...candidates].sort((a, b) => a.scheduledOffsetMinutes - b.scheduledOffsetMinutes)) {
    if (!nextLegByTail.has(flight.aircraftId)) nextLegByTail.set(flight.aircraftId, flight);
  }
  const chosen = fleet
    .filter((aircraft) => !aircraft.reserve && nextLegByTail.has(aircraft.id))
    .sort((a, b) => a.maintenanceDueInHours - b.maintenanceDueInHours || a.id.localeCompare(b.id))
    .slice(0, tails);
  return chosen.map((aircraft, index) => {
    const flight = nextLegByTail.get(aircraft.id);
    const plan = buildDelayPlan(flight, {
      delayMinutes,
      reason: `Unscheduled maintenance on ${aircraft.id} (${aircraft.maintenanceDueInHours} flight hours to next check)`,
      requiredChecks: ["Maintenance control releases the aircraft or confirms a swap", "Dispatcher validates crew duty and onward connections"]
    });
    return { ...plan, id: `PLAN-${Date.now()}-M${index + 1}` };
  });
}

/** Maintenance disruption descriptors (no plan ids) for the live ops session. */
export function maintenanceDisruptions({ tails = BASELINE_MAINTENANCE_TAILS, windowHours = DEFAULT_WINDOW_HOURS } = {}) {
  const delayMinutes = UNSCHEDULED_MAINTENANCE_DELAY_MINUTES;
  const candidates = flightsInWindow(windowHours).filter((flight) => flight.status !== "airborne");
  const nextLegByTail = new Map();
  for (const flight of [...candidates].sort((a, b) => a.scheduledOffsetMinutes - b.scheduledOffsetMinutes)) {
    if (!nextLegByTail.has(flight.aircraftId)) nextLegByTail.set(flight.aircraftId, flight);
  }
  return fleet
    .filter((aircraft) => !aircraft.reserve && nextLegByTail.has(aircraft.id))
    .sort((a, b) => a.maintenanceDueInHours - b.maintenanceDueInHours || a.id.localeCompare(b.id))
    .slice(0, tails)
    .map((aircraft) => {
      const flight = nextLegByTail.get(aircraft.id);
      return {
        flightId: flight.id,
        source: "maintenance",
        severity: "minor",
        reason: `Unscheduled maintenance on ${aircraft.id} (${aircraft.maintenanceDueInHours} flight hours to next check)`,
        delayMinutes,
        createdAtSim: 0,
        status: "open",
        aircraftId: aircraft.id
      };
    });
}

export function simulateDisaster(input = {}) {
  const severity = input.severity || "moderate";
  const radiusNm = Number(input.radiusNm || 120);
  const windowHours = input.windowHours === undefined ? DEFAULT_WINDOW_HOURS : Number(input.windowHours);
  const centerAirport = input.airport ? airport(input.airport) : null;
  const center = input.center || centerAirport;
  if (!center?.lat || !center?.lon || radiusNm <= 0) throw new Error("Provide an airport or center { lat, lon }, plus a positive radiusNm");
  if (!Number.isFinite(windowHours) || windowHours <= 0) throw new Error("windowHours must be a positive number of hours");
  const closedAirports = affectedAirportCodes({ center, radiusNm });
  const evaluated = flightsInWindow(windowHours);
  const plans = evaluated.map((flight) => detailedPlan(flight, closedAirports, severity)).filter(Boolean)
    .map((plan, index) => ({ ...plan, id: `PLAN-${Date.now()}-${index + 1}` }));
  const counts = Object.fromEntries(["reroute", "delay", "cancel", "hold_for_human_review"].map((action) => [action, plans.filter((plan) => plan.action === action).length]));
  return {
    mode: "benchmark_simulation_only", scenario: { id: `SIM-${Date.now()}`, type: input.type || "weather", severity, center, radiusNm, windowHours, startedAt: new Date().toISOString() },
    affectedAirports: closedAirports.map((icao) => airport(icao)), summary: { flightsEvaluated: evaluated.length, flightsInNetwork: flights.length, impactedFlights: plans.length, passengersAffected: plans.reduce((sum, plan) => sum + plan.passengers, 0), ...counts }, plans,
    safetyNotice: "Synthetic benchmark only. This result does not alter live operations and cannot be used as an ATC clearance or dispatch release."
  };
}
