import { useState } from "react";
import { affectedHow } from "../flightLabels";
import type { Flight } from "../types";

type Props = {
  ids: string[];
  flights: Flight[];
  onOpenFlight: (id: string) => void;
  onDismiss: () => void;
};

/**
 * Notice after a decision rewrites other pending plans. Click to see each knock-on.
 */
export function ImpactBanner({ ids, flights, onOpenFlight, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  const rows = ids
    .map((id) => flights.find((flight) => flight.id === id))
    .filter((flight): flight is Flight => Boolean(flight));

  return (
    <div className="butterfly-banner" data-open={open} role="status">
      <div className="butterfly-banner-bar">
        <button type="button" className="butterfly-banner-toggle" onClick={() => setOpen((value) => !value)}>
          {ids.length} other plan{ids.length === 1 ? "" : "s"} changed. {open ? "Hide" : "See how"}
        </button>
        <button type="button" className="butterfly-banner-close" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
      {open ? (
        <ul className="butterfly-list">
          {rows.length === 0 ? (
            <li className="butterfly-empty">Those flights are no longer on the live list.</li>
          ) : (
            rows.map((flight) => (
              <li key={flight.id}>
                <button type="button" className="butterfly-row" onClick={() => onOpenFlight(flight.id)}>
                  <strong>{flight.callsign}</strong>
                  <span>
                    {flight.origin} → {flight.destination}
                  </span>
                  <span>{affectedHow(flight)}</span>
                  {flight.proposedRoute ? <span>{flight.proposedRoute}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
