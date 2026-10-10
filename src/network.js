import { airports, crewAssignments, fleet, flights, passengerGroups, rotations } from "./data.js";

/** The whole multi-day network. Rotations, passenger groups and crew assignments are additive fields. */
export function operationalNetwork() {
  const now = Date.now();
  const at = (offsetMinutes) => new Date(now + offsetMinutes * 60_000).toISOString();
  const rotationOf = new Map(rotations.map((rotation) => [rotation.id, rotation]));
  return {
    generatedAt: new Date(now).toISOString(),
    airportCount: airports.length,
    aircraftCount: fleet.length,
    flightCount: flights.length,
    airports,
    aircraft: fleet,
    flights: flights.map((flight) => {
      const legs = rotationOf.get(flight.rotationId).flightIds;
      return {
        ...flight,
        scheduledAt: at(flight.scheduledOffsetMinutes),
        arrivalAt: at(flight.arrivalOffsetMinutes),
        nextRotation: legs[legs.indexOf(flight.id) + 1] || null
      };
    }),
    rotations: rotations.map((rotation) => ({
      ...rotation,
      startsAt: at(rotation.startOffsetMinutes),
      endsAt: at(rotation.endOffsetMinutes),
      maintenanceVisits: rotation.maintenanceVisits.map((visit) => ({ ...visit, startsAt: at(visit.startOffsetMinutes), endsAt: at(visit.endOffsetMinutes) }))
    })),
    passengerGroups,
    crewAssignments: crewAssignments.map((crew) => ({ ...crew, reportAt: at(crew.reportOffsetMinutes), releaseAt: at(crew.releaseOffsetMinutes) }))
  };
}

export async function pullOpenSkyStates({ fetchImpl = fetch, token = process.env.OPENSKY_ACCESS_TOKEN } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetchImpl("https://opensky-network.org/api/states/all", { headers });
  if (!response.ok) throw new Error(`OpenSky request failed: ${response.status}`);
  const body = await response.json();
  return {
    provider: "OpenSky Network", observedAt: new Date((body.time || Date.now() / 1000) * 1000).toISOString(),
    flights: (body.states || []).map((state) => ({ icao24: state[0], callsign: state[1]?.trim() || null, longitude: state[5], latitude: state[6], baroAltitudeM: state[7], onGround: state[8], velocityMs: state[9] }))
  };
}
