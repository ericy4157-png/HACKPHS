export const airports = [
  { icao: "KJFK", name: "John F. Kennedy International", city: "New York", lat: 40.6413, lon: -73.7781, runwayFt: 14511, status: "open" },
  { icao: "KBOS", name: "Boston Logan International", city: "Boston", lat: 42.3656, lon: -71.0096, runwayFt: 10083, status: "open" },
  { icao: "KIAD", name: "Washington Dulles International", city: "Washington", lat: 38.9531, lon: -77.4565, runwayFt: 11500, status: "open" },
  { icao: "KORD", name: "Chicago O'Hare International", city: "Chicago", lat: 41.9742, lon: -87.9073, runwayFt: 13000, status: "open" },
  { icao: "KDEN", name: "Denver International", city: "Denver", lat: 39.8561, lon: -104.6737, runwayFt: 16000, status: "open" },
  { icao: "KLAX", name: "Los Angeles International", city: "Los Angeles", lat: 33.9416, lon: -118.4085, runwayFt: 12091, status: "open" },
  { icao: "KSFO", name: "San Francisco International", city: "San Francisco", lat: 37.6213, lon: -122.3790, runwayFt: 11870, status: "open" },
  { icao: "KSEA", name: "Seattle-Tacoma International", city: "Seattle", lat: 47.4502, lon: -122.3088, runwayFt: 11901, status: "open" },
  { icao: "EGLL", name: "London Heathrow", city: "London", lat: 51.4700, lon: -0.4543, runwayFt: 12799, status: "open" },
  { icao: "LFPG", name: "Paris Charles de Gaulle", city: "Paris", lat: 49.0097, lon: 2.5479, runwayFt: 13829, status: "open" },
  { icao: "EDDF", name: "Frankfurt Airport", city: "Frankfurt", lat: 50.0379, lon: 8.5622, runwayFt: 13123, status: "open" },
  { icao: "LTFM", name: "Istanbul Airport", city: "Istanbul", lat: 41.2753, lon: 28.7519, runwayFt: 13451, status: "open" },
  { icao: "OMDB", name: "Dubai International", city: "Dubai", lat: 25.2532, lon: 55.3657, runwayFt: 13124, status: "open" },
  { icao: "VABB", name: "Mumbai International", city: "Mumbai", lat: 19.0896, lon: 72.8656, runwayFt: 11300, status: "open" },
  { icao: "WSSS", name: "Singapore Changi", city: "Singapore", lat: 1.3644, lon: 103.9915, runwayFt: 13123, status: "open" },
  { icao: "RJTT", name: "Tokyo Haneda", city: "Tokyo", lat: 35.5494, lon: 139.7798, runwayFt: 11000, status: "open" },
  { icao: "KATL", name: "Hartsfield-Jackson Atlanta", city: "Atlanta", lat: 33.6407, lon: -84.4277, runwayFt: 12390, status: "open" },
  { icao: "KDFW", name: "Dallas Fort Worth International", city: "Dallas", lat: 32.8998, lon: -97.0403, runwayFt: 13401, status: "open" },
  { icao: "KMIA", name: "Miami International", city: "Miami", lat: 25.7959, lon: -80.2870, runwayFt: 13016, status: "open" },
  { icao: "CYYZ", name: "Toronto Pearson International", city: "Toronto", lat: 43.6777, lon: -79.6248, runwayFt: 11000, status: "open" },
  { icao: "MMMX", name: "Mexico City International", city: "Mexico City", lat: 19.4361, lon: -99.0719, runwayFt: 12800, status: "open" },
  { icao: "SBGR", name: "São Paulo/Guarulhos", city: "São Paulo", lat: -23.4356, lon: -46.4731, runwayFt: 12139, status: "open" },
  { icao: "EHAM", name: "Amsterdam Schiphol", city: "Amsterdam", lat: 52.3105, lon: 4.7683, runwayFt: 12467, status: "open" },
  { icao: "LEMD", name: "Adolfo Suárez Madrid-Barajas", city: "Madrid", lat: 40.4983, lon: -3.5676, runwayFt: 14327, status: "open" },
  { icao: "LIRF", name: "Rome Fiumicino", city: "Rome", lat: 41.8003, lon: 12.2389, runwayFt: 12795, status: "open" },
  { icao: "FAOR", name: "O. R. Tambo International", city: "Johannesburg", lat: -26.1337, lon: 28.2420, runwayFt: 14495, status: "open" },
  { icao: "HECA", name: "Cairo International", city: "Cairo", lat: 30.1219, lon: 31.4056, runwayFt: 13123, status: "open" },
  { icao: "VIDP", name: "Delhi Indira Gandhi International", city: "Delhi", lat: 28.5562, lon: 77.1000, runwayFt: 14534, status: "open" },
  { icao: "VTBS", name: "Bangkok Suvarnabhumi", city: "Bangkok", lat: 13.6900, lon: 100.7501, runwayFt: 13123, status: "open" },
  { icao: "VHHH", name: "Hong Kong International", city: "Hong Kong", lat: 22.3080, lon: 113.9185, runwayFt: 12467, status: "open" },
  { icao: "RKSI", name: "Seoul Incheon International", city: "Seoul", lat: 37.4602, lon: 126.4407, runwayFt: 12303, status: "open" },
  { icao: "YSSY", name: "Sydney Kingsford Smith", city: "Sydney", lat: -33.9399, lon: 151.1753, runwayFt: 12999, status: "open" }
];

// Simplified operational polygons for demonstration only. Production use requires
// validated, time-bounded NOTAM/AIP and sovereign airspace data.
export const restrictedZones = [
  { id: "UA-CONFLICT", name: "Ukraine conflict airspace", reason: "Active conflict / FIR restriction", severity: "prohibited", polygon: [[44, 22], [53, 22], [53, 41], [44, 41]] },
  { id: "RU-RESTRICTED", name: "Russian overflight restriction", reason: "Operator policy / sanctions", severity: "prohibited", polygon: [[41, 27], [78, 27], [78, 190], [41, 190]] },
  { id: "GAZA-CONFLICT", name: "Gaza conflict airspace", reason: "Active conflict", severity: "prohibited", polygon: [[30.9, 34.1], [31.8, 34.1], [31.8, 35.0], [30.9, 35.0]] },
  { id: "TIBET-HIGH-TERRAIN", name: "Tibetan Plateau high terrain", reason: "High terrain / limited diversion options", severity: "avoid", polygon: [[27, 78], [37, 78], [37, 104], [27, 104]] }
];

export const flights = [
  { id: "SKY101", callsign: "SKY101", origin: "KJFK", destination: "EGLL", position: { lat: 48.1, lon: -38.4 }, passengers: 284, aircraft: "A350-900", aircraftId: "N901SK", fuelMinutes: 315, status: "airborne", scheduledOffsetMinutes: -170 },
  { id: "SKY204", callsign: "SKY204", origin: "EGLL", destination: "OMDB", position: { lat: 43.4, lon: 20.1 }, passengers: 231, aircraft: "B787-9", aircraftId: "N902SK", fuelMinutes: 380, status: "airborne", scheduledOffsetMinutes: -245 },
  { id: "SKY305", callsign: "SKY305", origin: "KORD", destination: "KLAX", position: { lat: 41.0, lon: -96.0 }, passengers: 178, aircraft: "A321neo", aircraftId: "N903SK", fuelMinutes: 205, status: "airborne", scheduledOffsetMinutes: -105 },
  { id: "SKY118", callsign: "SKY118", origin: "EGLL", destination: "KJFK", passengers: 287, aircraft: "A350-900", aircraftId: "N904SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 85 },
  { id: "SKY219", callsign: "SKY219", origin: "OMDB", destination: "EGLL", passengers: 244, aircraft: "B787-9", aircraftId: "N902SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 190 },
  { id: "SKY311", callsign: "SKY311", origin: "KLAX", destination: "KORD", passengers: 181, aircraft: "A321neo", aircraftId: "N903SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 155 },
  { id: "SKY412", callsign: "SKY412", origin: "KSEA", destination: "KSFO", passengers: 151, aircraft: "A320neo", aircraftId: "N905SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 45 },
  { id: "SKY413", callsign: "SKY413", origin: "KSFO", destination: "KSEA", passengers: 149, aircraft: "A320neo", aircraftId: "N905SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 190 },
  { id: "SKY512", callsign: "SKY512", origin: "LFPG", destination: "LTFM", passengers: 168, aircraft: "A321neo", aircraftId: "N906SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 70 },
  { id: "SKY513", callsign: "SKY513", origin: "LTFM", destination: "LFPG", passengers: 166, aircraft: "A321neo", aircraftId: "N906SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 225 },
  { id: "SKY610", callsign: "SKY610", origin: "KDEN", destination: "KJFK", passengers: 175, aircraft: "B737-8", aircraftId: "N907SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 120 },
  { id: "SKY611", callsign: "SKY611", origin: "KJFK", destination: "KDEN", passengers: 171, aircraft: "B737-8", aircraftId: "N907SK", fuelMinutes: 0, status: "scheduled", scheduledOffsetMinutes: 325 },
  { id: "SKY820", callsign: "SKY820", origin: "KDFW", destination: "KMIA", position: { lat: 29.3, lon: -87.2 }, passengers: 176, aircraft: "A321neo", aircraftId: "N903SK", fuelMinutes: 180, status: "airborne", scheduledOffsetMinutes: -95 },
  { id: "SKY821", callsign: "SKY821", origin: "VHHH", destination: "RJTT", position: { lat: 30.1, lon: 125.4 }, passengers: 242, aircraft: "B787-9", aircraftId: "N902SK", fuelMinutes: 260, status: "airborne", scheduledOffsetMinutes: -135 },
  { id: "SKY822", callsign: "SKY822", origin: "LFPG", destination: "LIRF", position: { lat: 43.1, lon: 8.3 }, passengers: 169, aircraft: "A321neo", aircraftId: "N906SK", fuelMinutes: 130, status: "airborne", scheduledOffsetMinutes: -65 }
];

export const fleet = [
  { id: "N901SK", type: "A350-900", location: "EGLL", maintenanceDueInHours: 42, minimumTurnMinutes: 105 },
  { id: "N902SK", type: "B787-9", location: "EGLL", maintenanceDueInHours: 11, minimumTurnMinutes: 95 },
  { id: "N903SK", type: "A321neo", location: "KORD", maintenanceDueInHours: 27, minimumTurnMinutes: 55 },
  { id: "N904SK", type: "A350-900", location: "EGLL", maintenanceDueInHours: 64, minimumTurnMinutes: 105 },
  { id: "N905SK", type: "A320neo", location: "KSEA", maintenanceDueInHours: 19, minimumTurnMinutes: 50 },
  { id: "N906SK", type: "A321neo", location: "LFPG", maintenanceDueInHours: 6, minimumTurnMinutes: 55 },
  { id: "N907SK", type: "B737-8", location: "KDEN", maintenanceDueInHours: 31, minimumTurnMinutes: 50 }
];

// Synthetic schedule coverage makes the demo deterministic while providing every
// airport in this test network with at least one movement to analyze.
const syntheticRoutes = [
  ["KATL", "KJFK"], ["KDFW", "KLAX"], ["KMIA", "KATL"], ["CYYZ", "KORD"], ["MMMX", "KDFW"], ["SBGR", "KMIA"],
  ["EHAM", "EGLL"], ["LEMD", "LFPG"], ["LIRF", "EDDF"], ["FAOR", "OMDB"], ["HECA", "LTFM"], ["VIDP", "OMDB"],
  ["VTBS", "WSSS"], ["VHHH", "RJTT"], ["RKSI", "RJTT"], ["YSSY", "WSSS"], ["KJFK", "CYYZ"], ["EGLL", "EHAM"]
];
flights.push(...syntheticRoutes.map(([origin, destination], index) => ({
  id: `SKY${700 + index}`, callsign: `SKY${700 + index}`, origin, destination, passengers: 112 + (index * 13 % 165),
  aircraft: index % 3 === 0 ? "B787-9" : "A321neo", aircraftId: `N${901 + index % 7}SK`, fuelMinutes: 0,
  status: "scheduled", scheduledOffsetMinutes: 55 + index * 28
})));
