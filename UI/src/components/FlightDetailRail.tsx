import { useState } from "react";
import type { Flight } from "../types";
import { acceptReroute, rejectReroute } from "../api/client";
import { airportByIata } from "../data/mockFlights";

type Props = {
  flight: Flight | null;
};

function pathLabel(flight: Flight, kind: "original" | "proposed"): string {
  if (kind === "original") {
    return `${flight.origin} → ${flight.destination}`;
  }
  const codes = flight.proposedPath
    .map((coord) => {
      // Match known airports near waypoints for a readable via line
      const hits = [flight.origin, flight.destination, "ORD", "DFW", "DEN", "ATL", "CLT"];
      for (const code of hits) {
        const a = airportByIata(code);
        if (Math.abs(a.lat - coord[0]) < 0.3 && Math.abs(a.lng - coord[1]) < 0.3) {
          return code;
        }
      }
      return null;
    })
    .filter((x): x is string => Boolean(x));

  const unique = codes.filter((c, i) => codes.indexOf(c) === i);
  if (unique.length >= 2) return unique.join(" → ");
  return `${flight.origin} → via hub → ${flight.destination}`;
}

export function FlightDetailRail({ flight }: Props) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!flight) {
    return (
      <aside className="rail rail-right">
        <div className="empty-select">
          <p className="rail-kicker">Selection</p>
          <h3>Select a flight</h3>
          <p className="rail-body">
            Click a glowing marker on the globe to inspect its disrupted path and the proposed
            reroute.
          </p>
        </div>
      </aside>
    );
  }

  const origin = airportByIata(flight.origin);
  const dest = airportByIata(flight.destination);

  const onAccept = async () => {
    setBusy("accept");
    setNote(null);
    try {
      await acceptReroute(flight.id);
      setNote("Reroute accepted (mock).");
    } catch {
      setNote("Accept failed.");
    } finally {
      setBusy(null);
    }
  };

  const onReject = async () => {
    setBusy("reject");
    setNote(null);
    try {
      await rejectReroute(flight.id);
      setNote("Reroute rejected (mock).");
    } catch {
      setNote("Reject failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="rail rail-right">
      <p className="rail-kicker">Flight detail</p>
      <div className="flight-head">
        <h2 className="callsign">{flight.callsign}</h2>
        <div className="route-line">
          {flight.origin} → {flight.destination}
        </div>
        <span className="status-chip" data-status={flight.status}>
          {flight.status}
        </span>
      </div>

      <div className="metric-row">
        <div className="metric">
          <span className="metric-label">Delay</span>
          <span className="metric-value">+{flight.delayMinutes}m</span>
        </div>
        <div className="metric">
          <span className="metric-label">Souls</span>
          <span className="metric-value">{flight.passengers}</span>
        </div>
      </div>

      <p className="rail-body">
        {origin.city} to {dest.city}. Skyward proposes a capacity-aware path to absorb the cascade.
      </p>

      <div className="path-compare">
        <div className="path-row original">
          <span className="path-label">Original</span>
          <span>{pathLabel(flight, "original")}</span>
        </div>
        <div className="path-row proposed">
          <span className="path-label">Reroute</span>
          <span>{pathLabel(flight, "proposed")}</span>
        </div>
      </div>

      {note && <p className="rail-body">{note}</p>}

      <div className="actions">
        <button className="btn btn-primary" disabled={busy !== null} onClick={onAccept}>
          {busy === "accept" ? "…" : "Accept"}
        </button>
        <button className="btn btn-ghost" disabled={busy !== null} onClick={onReject}>
          {busy === "reject" ? "…" : "Reject"}
        </button>
      </div>
    </aside>
  );
}
