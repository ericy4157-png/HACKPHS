import { airports, fleet, flights } from "./data.js";
import { buildComparison } from "./comparison.js";
import { distanceNm, diversionOptions, planReroute } from "./routing.js";

const airport = (icao) => airports.find((item) => item.icao === icao);
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

function detailedPlan(flight, closedAirports, severity) {
  const aircraft = fleet.find((item) => item.id === flight.aircraftId);
  const action = flightImpact(flight, closedAirports, severity);
  if (!action) return null;
  const currentPosition = flight.position || airport(flight.origin);
  const standard = {
    flightId: flight.id, callsign: flight.callsign, aircraft: flight.aircraftId, passengers: flight.passengers,
    action, approvalStatus: "pending", generatedAt: new Date().toISOString(),
    routeContext: { origin: airport(flight.origin), originalDestination: airport(flight.destination), currentPosition: flight.position || airport(flight.origin) },
    requiredChecks: ["Dispatcher validates NOTAM, weather, ETOPS/performance, crew duty and traffic-flow constraints", "ATC and airport operations acceptance required before execution"]
  };
  if (action === "cancel") return finish(flight, closedAirports, { ...standard, plan: { reason: "Departure airport unavailable during severe disruption", passengerRecovery: "Rebook to next available protected itinerary", aircraftAction: "Hold at origin; await ramp and maintenance release" } });
  if (action === "delay") {
    const delayMinutes = severity === "severe" ? 240 : 90;
    return finish(flight, closedAirports, { ...standard, plan: { reason: "Origin or destination operating below capacity", estimatedDelayMinutes: delayMinutes, fuelAndRamp: `Fuel uplift after gate assignment; minimum turnaround ${aircraft.minimumTurnMinutes} min`, maintenance: aircraft.maintenanceDueInHours < 8 ? "Maintenance check required before next rotation" : `Maintenance due in ${aircraft.maintenanceDueInHours} flight hours`, revisedDeparture: nowIso(flight.scheduledOffsetMinutes + delayMinutes) } });
  }
  const alternates = diversionOptions(currentPosition, flight.aircraft, closedAirports, airport(flight.destination));
  if (!alternates.length) return finish(flight, closedAirports, { ...standard, action: "hold_for_human_review", plan: { reason: "No compliant diversion airport found in modeled network" } });
  // Alternates are already ranked; take the best one whose fuel margin is not negative.
  const evaluated = alternates.map((alternate) => ({ alternate, ...rerouteOrError(flight, alternate.icao, closedAirports) }));
  const fuelChecks = evaluated.map(({ alternate, reroute, error }) => (reroute
    ? { airport: alternate.icao, fuelMarginMinutes: reroute.operationalAssessment.fuelMarginMinutes }
    : { airport: alternate.icao, fuelMarginMinutes: null, error }));
  const chosen = evaluated.find(({ reroute }) => reroute && reroute.operationalAssessment.fuelMarginMinutes >= 0);
  if (!chosen) {
    const margins = fuelChecks.map((check) => (check.error ? `${check.airport} no route` : `${check.airport} ${check.fuelMarginMinutes} min`)).join(", ");
    return finish(flight, closedAirports, { ...standard, action: "hold_for_human_review", plan: { reason: `Destination ${flight.destination} unavailable and no alternate meets the fuel reserve (fuel margin: ${margins})`, alternateFuelChecks: fuelChecks } });
  }
  const destination = chosen.alternate.icao;
  const reroute = chosen.reroute;
  return finish(flight, closedAirports, { ...standard, plan: { reason: `Destination ${flight.destination} unavailable`, diversionAirport: destination, diversionRunwayCheck: chosen.alternate.runwayCheck, alternateFuelChecks: fuelChecks, reroute, fuelAndRamp: `Confirm landing fuel reserve; arrange fuel, gate and handling at ${destination}`, maintenance: aircraft.maintenanceDueInHours < 8 ? "Maintenance control approval required at diversion" : `Maintenance check remains due in ${aircraft.maintenanceDueInHours} flight hours`, onwardRecovery: `Protect passengers and evaluate recovery service to ${flight.destination}` } });
}

function finish(flight, closedAirports, plan) {
  const comparison = buildComparison({ flight, action: plan.action, delayMinutes: plan.plan.estimatedDelayMinutes || 0, diversionAirport: plan.plan.diversionAirport, reroute: plan.plan.reroute, closedAirports });
  plan.plan.changeSummary = { timing: comparison.deltas.timing, aircraft: comparison.deltas.aircraft, layover: comparison.deltas.layover };
  return { ...plan, comparison };
}

export const DEFAULT_WINDOW_HOURS = 24;

/**
 * Legs an event can affect: airborne legs, plus scheduled legs departing before the window closes.
 * The window is how long the event lasts; it is not the recovery engine's lookahead depth.
 */
export function flightsInWindow(windowHours = DEFAULT_WINDOW_HOURS) {
  return flights.filter((flight) => flight.status === "airborne" || flight.scheduledOffsetMinutes < windowHours * 60);
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
