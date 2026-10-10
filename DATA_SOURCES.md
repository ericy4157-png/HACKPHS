# Data sources

Every reference dataset Skyward uses, with its license and how it is built. Reference data is
baked into committed JSON; the API never fetches it at runtime.

## data/reference/airports.json

| | |
|---|---|
| Source | [OurAirports](https://ourairports.com/data/): `airports.csv` and `runways.csv` |
| License | Public domain (per OurAirports) |
| Downloaded | 2026-10-10 (15:25 UTC), from the OurAirports data mirror at `https://davidmegginson.github.io/ourairports-data/` |
| Built by | `npm run build:reference` (`scripts/build-reference.js`) |
| Fields used | `ident`, `iata_code`, `name`, `latitude_deg`, `longitude_deg`, `elevation_ft` from airports; `airport_ident`, `length_ft`, `closed` from runways |
| Coverage | The 32 airports in `src/builtInAirports.js`. `longestRunwayFt` is the longest runway not marked closed. |

To refresh it, put new exports in `data/raw/` (git-ignored), run `npm run build:reference`, update the
download date above, and commit the regenerated JSON. If the JSON is missing or invalid, the API logs
one warning and uses the built-in values in `src/builtInAirports.js`.

The snapshot replaces only latitude, longitude and runway length on the network airports. Names and
cities are hand-maintained. Flights, aircraft rotations, fuel, maintenance, crew duty and passenger
itineraries are synthetic: generated at load from a fixed seed around 33 hand-authored anchor flights,
using simplified prototype performance values (see `docs/network-model.md`).

## UI/src/data/demoSnapshot.json

A frozen copy of this API's own output for all four seeded scenarios (`GET /api/incident` and
`GET /api/flights` for scenario 1, then `POST /api/scenario/next` three times, from a fresh process),
used by the globe UI when the backend is unreachable. It inherits the airport coordinates above and is
otherwise synthetic. Its `capturedAt` field records when it was taken.
