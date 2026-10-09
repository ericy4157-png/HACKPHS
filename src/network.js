import { airports, fleet, flights } from "./data.js";

export function operationalNetwork() {
  const now = Date.now();
  return {
    generatedAt: new Date(now).toISOString(),
    airportCount: airports.length,
    aircraftCount: fleet.length,
    flightCount: flights.length,
    airports,
    aircraft: fleet,
    flights: flights.map((flight) => ({
      ...flight,
      scheduledAt: new Date(now + flight.scheduledOffsetMinutes * 60_000).toISOString(),
      nextRotation: flights.filter((next) => next.aircraftId === flight.aircraftId && next.scheduledOffsetMinutes > flight.scheduledOffsetMinutes)
        .sort((a, b) => a.scheduledOffsetMinutes - b.scheduledOffsetMinutes)[0]?.id || null
    }))
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
