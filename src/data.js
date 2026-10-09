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
  { icao: "RJTT", name: "Tokyo Haneda", city: "Tokyo", lat: 35.5494, lon: 139.7798, runwayFt: 11000, status: "open" }
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
  { id: "SKY101", callsign: "SKY101", origin: "KJFK", destination: "EGLL", position: { lat: 48.1, lon: -38.4 }, passengers: 284, aircraft: "A350-900", fuelMinutes: 315, status: "airborne" },
  { id: "SKY204", callsign: "SKY204", origin: "EGLL", destination: "OMDB", position: { lat: 43.4, lon: 20.1 }, passengers: 231, aircraft: "B787-9", fuelMinutes: 380, status: "airborne" },
  { id: "SKY305", callsign: "SKY305", origin: "KORD", destination: "KLAX", position: { lat: 41.0, lon: -96.0 }, passengers: 178, aircraft: "A321neo", fuelMinutes: 205, status: "airborne" }
];
