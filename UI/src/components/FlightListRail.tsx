import { useMemo } from "react";
import type { Flight } from "../types";

export type ListFilter = "needs_decision" | "decided" | "all";

type Props = {
  flights: Flight[];
  query: string;
  filter: ListFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: ListFilter) => void;
  onSelect: (flightId: string) => void;
};

const FILTERS: { value: ListFilter; label: string }[] = [
  { value: "needs_decision", label: "To decide" },
  { value: "decided", label: "Decided" },
  { value: "all", label: "All" },
];

function needsDecision(flight: Flight): boolean {
  return flight.status !== "ok" && (flight.approvalStatus === undefined || flight.approvalStatus === "pending");
}

function matchesFilter(flight: Flight, filter: ListFilter): boolean {
  if (filter === "all") return true;
  if (filter === "needs_decision") return needsDecision(flight);
  return flight.approvalStatus === "approved" || flight.approvalStatus === "rejected";
}

function matchesQuery(flight: Flight, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [flight.callsign, flight.origin, flight.destination].some((field) => field.toLowerCase().includes(q));
}

function rowStatusLabel(flight: Flight): string {
  if (flight.approvalStatus === "approved") return "accepted";
  if (flight.approvalStatus === "rejected") return "rejected";
  return flight.status;
}

/** Selection rail shown when no flight is selected: a searchable, filterable list of flights. */
export function FlightListRail({ flights, query, filter, onQueryChange, onFilterChange, onSelect }: Props) {
  // Flights that still need a decision come first, then the longest delays.
  const visible = useMemo(
    () =>
      flights
        .filter((f) => matchesFilter(f, filter) && matchesQuery(f, query))
        .sort((a, b) => Number(needsDecision(b)) - Number(needsDecision(a)) || b.delayMinutes - a.delayMinutes),
    [flights, filter, query],
  );

  return (
    <aside className="rail rail-right">
      <div>
        <p className="rail-kicker">Selection</p>
        <h2 className="rail-title">Flights</h2>
      </div>

      <input
        className="flight-search"
        type="search"
        placeholder="Search callsign or airport"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search flights"
      />

      <div className="filter-row" role="tablist" aria-label="Filter flights">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            className="filter-chip"
            data-active={filter === value}
            onClick={() => onFilterChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rail-body">No flights match. Try another filter or search.</p>
      ) : (
        <ul className="flight-list">
          {visible.map((flight) => (
            <li key={flight.id}>
              <button className="flight-row" onClick={() => onSelect(flight.id)}>
                <span className="flight-row-main">
                  <span className="flight-row-callsign">{flight.callsign}</span>
                  <span className="flight-row-route">
                    {flight.origin} → {flight.destination}
                  </span>
                </span>
                <span className="flight-row-side">
                  <span className="status-chip" data-status={flight.status}>
                    {rowStatusLabel(flight)}
                  </span>
                  {flight.delayMinutes > 0 && <span className="flight-row-delay">+{flight.delayMinutes}m</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="rail-footnote">
        {visible.length} of {flights.length} flights · or click a marker on the globe
      </p>
    </aside>
  );
}
