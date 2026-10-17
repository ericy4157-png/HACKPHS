// Dependency-free geometry, so data generation can use it without importing routing.js
// (routing.js imports data.js, which would make a cycle).

const EARTH_RADIUS_NM = 3440.065;
const toRad = (value) => value * Math.PI / 180;

/** Great-circle distance in nautical miles between two { lat, lon } points. */
export function distanceNm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
