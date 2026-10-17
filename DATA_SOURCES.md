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
| Coverage | The airports listed in `src/builtInAirports.js` (60 in the mid-size network). `longestRunwayFt` is the longest runway not marked closed. Expanded airports may use built-in coordinates until the next OurAirports rebuild. |

To refresh it, put new exports in `data/raw/` (git-ignored), run `npm run build:reference`, update the
download date above, and commit the regenerated JSON. If the JSON is missing or invalid, the API logs
one warning and uses the built-in values in `src/builtInAirports.js`.

The snapshot replaces only latitude, longitude and runway length on the network airports. Names and
cities are hand-maintained. Flights, aircraft rotations, fuel, maintenance, crew duty and passenger
itineraries are synthetic: generated at load from a fixed seed around 33 hand-authored anchor flights,
using simplified prototype performance values (see `docs/network-model.md`).

## UI/public/demo/demoSnapshot.json

Compact freeze of the four seeded scenarios for the globe UI when the backend is unreachable.
Format: `baseFlights` (compact markers for every leg) plus per-scenario `incident` and
`affectedFlights` (full detail). Rebuild with `npm run freeze:demo`. Loaded lazily via `fetch`,
not bundled into the JS chunk.

## data/reference/bts-slice.json (optional)

| | |
|---|---|
| Source | [US BTS Airline On-Time Performance](https://www.transtats.bts.gov/) |
| License | **Confirm current BTS terms before committing.** US government data is often public, but do not assume redistribution rights. |
| Built by | `npm run build:bts -- --carrier AA --date YYYY-MM-DD` (`scripts/build-bts.js`) |
| Input | Monthly CSV in `data/raw/bts/` (git-ignored) |
| Role | Optional real one-carrier, one-day rotations alongside the synthetic network. Not loaded at runtime until a selector is wired. Crew and maintenance stay synthetic. |
