/**
 * Lookups built once after the network loads, so planner and API code do not scan the whole
 * flight list inside loops. Behavior is identical to the linear searches they replace.
 */

/**
 * Build indexes from a generated network and its airport list.
 * @param {{ flights: object[], fleet: object[], rotations: object[], passengerGroups: object[] }} network
 * @param {object[]} airports
 */
export function buildNetworkIndex(network, airports) {
  const { flights, rotations, passengerGroups } = network;

  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const airportByIcao = new Map(airports.map((airport) => [airport.icao, airport]));

  const legsByTail = new Map();
  const visitsByTail = new Map();
  for (const rotation of rotations) {
    const legs = rotation.flightIds.map((id) => flightById.get(id)).filter(Boolean);
    legsByTail.set(rotation.tailId, legs);
    visitsByTail.set(rotation.tailId, rotation.maintenanceVisits ?? []);
  }
  // Reserve (or otherwise legless) tails still get empty lists so callers never see undefined.
  for (const tail of network.fleet) {
    if (!legsByTail.has(tail.id)) legsByTail.set(tail.id, []);
    if (!visitsByTail.has(tail.id)) visitsByTail.set(tail.id, []);
  }

  const groupsByFlight = new Map();
  for (const group of passengerGroups) {
    for (const flightId of group.flightIds) {
      const list = groupsByFlight.get(flightId);
      if (list) list.push(group);
      else groupsByFlight.set(flightId, [group]);
    }
  }

  const departuresByAirport = new Map();
  for (const flight of flights) {
    const list = departuresByAirport.get(flight.origin);
    if (list) list.push(flight);
    else departuresByAirport.set(flight.origin, [flight]);
  }
  for (const list of departuresByAirport.values()) {
    list.sort((a, b) => a.scheduledOffsetMinutes - b.scheduledOffsetMinutes);
  }

  return {
    flightById,
    airportByIcao,
    legsByTail,
    visitsByTail,
    groupsByFlight,
    departuresByAirport
  };
}
