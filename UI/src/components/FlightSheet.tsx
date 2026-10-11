import { useEffect, useMemo, useState } from "react";
import { ACTION_LABEL, needsDecision } from "../flightLabels";
import type { Flight } from "../types";

type Props = {
  flights: Flight[];
  changedIds?: string[];
  onBack: () => void;
};

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function approvalLabel(flight: Flight): string {
  if (needsDecision(flight)) return "Needs approval";
  if (flight.approvalStatus === "approved") return "Approved";
  if (flight.approvalStatus === "rejected") return "Rejected";
  return "Clear";
}

function refuelLabel(flight: Flight): string {
  if ((flight.refuelMinutes ?? 0) > 0) return `${flight.refuelMinutes} min before dep`;
  if (flight.nextRefuel) return `${flight.nextRefuel.minutes} min on ${flight.nextRefuel.flightId}`;
  return "No uplift";
}

function compareApprovalFirst(a: Flight, b: Flight): number {
  return Number(needsDecision(b)) - Number(needsDecision(a))
    || new Date(a.departureAt ?? 0).getTime() - new Date(b.departureAt ?? 0).getTime();
}

/**
 * Spreadsheet of every rostered leg. Approval-needed rows sit at the top.
 * Selecting a row opens that tail's rotation history in a closeable side panel.
 */
export function FlightSheet({ flights, changedIds = [], onBack }: Props) {
  const changed = useMemo(() => new Set(changedIds), [changedIds]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? flights.filter((flight) => {
          const hay = [
            flight.callsign,
            flight.origin,
            flight.destination,
            flight.aircraftId,
            flight.aircraftType,
            approvalLabel(flight),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : flights;
    return [...filtered].sort(compareApprovalFirst);
  }, [flights, query]);

  const selected = rows.find((flight) => flight.id === selectedId) ?? flights.find((flight) => flight.id === selectedId) ?? null;
  const history = useMemo(() => {
    if (!selected?.aircraftId) return selected ? [selected] : [];
    return flights
      .filter((flight) => flight.aircraftId === selected.aircraftId)
      .sort((a, b) => new Date(a.departureAt ?? 0).getTime() - new Date(b.departureAt ?? 0).getTime());
  }, [flights, selected]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const toggleRow = (id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  };

  return (
    <section className="sheet flight-sheet" data-open={Boolean(selected)} aria-label="Flight sheet">
      <header className="sheet-head">
        <button type="button" className="back-link" onClick={onBack}>
          ← Dashboard
        </button>
        <div className="sheet-head-row">
          <div className="sheet-head-copy">
            <h1 className="sheet-title">Flight sheet</h1>
            <p className="sheet-sub">{rows.length} legs · click a row for history</p>
          </div>
          <input
            className="sheet-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search callsign, tail, airport…"
            aria-label="Search flights"
          />
        </div>
      </header>

      <div className="sheet-body">
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Approval</th>
                <th>Flight</th>
                <th>Route</th>
                <th>Aircraft</th>
                <th>Departure</th>
                <th>Arrival</th>
                <th>Trips</th>
                <th>Refuel</th>
                <th>Fuel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((flight) => (
                <tr
                  key={flight.id}
                  data-pending={needsDecision(flight)}
                  data-changed={changed.has(flight.id)}
                  data-active={flight.id === selectedId}
                  onClick={() => toggleRow(flight.id)}
                >
                  <td>{approvalLabel(flight)}</td>
                  <td>
                    <strong>{flight.callsign}</strong>
                    {flight.action ? <span className="sheet-muted"> · {ACTION_LABEL[flight.action]}</span> : null}
                  </td>
                  <td>
                    {flight.origin} → {flight.destination}
                  </td>
                  <td>
                    {flight.aircraftId ?? "—"}
                    <span className="sheet-muted"> · {flight.aircraftType ?? "—"}</span>
                  </td>
                  <td>{formatWhen(flight.departureAt)}</td>
                  <td>{formatWhen(flight.arrivalAt)}</td>
                  <td>
                    {flight.legNumber != null && flight.tripsOnTail
                      ? `${flight.legNumber} / ${flight.tripsOnTail}`
                      : (flight.tripsOnTail ?? "—")}
                  </td>
                  <td>{refuelLabel(flight)}</td>
                  <td>
                    {flight.fuel
                      ? `${Math.round(flight.fuel.departureKg / 100) / 10}t → ${Math.round(flight.fuel.arrivalKg / 100) / 10}t`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected ? (
          <aside className="sheet-history" aria-label={`History for ${selected.aircraftId ?? selected.callsign}`}>
            <div className="sheet-history-head">
              <div>
                <p className="rail-kicker">Aircraft history</p>
                <h2 className="rail-title">
                  {selected.aircraftId ?? "Unknown tail"}{" "}
                  <span className="sheet-muted">{selected.aircraftType}</span>
                </h2>
                <p className="rail-body">
                  {history.length} trip{history.length === 1 ? "" : "s"} on this rotation
                </p>
              </div>
              <button type="button" className="btn btn-ghost sheet-history-close" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>
            <ol className="sheet-history-list">
              {history.map((leg) => (
                <li key={leg.id} data-current={leg.id === selected.id}>
                  <button type="button" className="sheet-history-row" onClick={() => setSelectedId(leg.id)}>
                    <span className="sheet-history-when">{formatWhen(leg.departureAt)}</span>
                    <strong>{leg.callsign}</strong>
                    <span>
                      {leg.origin} → {leg.destination}
                    </span>
                    <span className="sheet-muted">{refuelLabel(leg)}</span>
                    <span className="sheet-muted">{approvalLabel(leg)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
