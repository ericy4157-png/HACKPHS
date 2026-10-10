/**
 * Hand-written fallback values for the 32-airport test network.
 * Used as-is when data/reference/airports.json is missing; otherwise the snapshot
 * supplies lat, lon and runwayFt (see src/referenceData.js).
 */
export const builtInAirports = [
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
