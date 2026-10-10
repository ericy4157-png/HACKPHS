import { useState } from "react";
import type { DecisionResult, Flight } from "../types";
import { acceptReroute, isMockMode, rejectReroute } from "../api/client";

type Props = {
  flight: Flight;
  onDecision: (result: DecisionResult) => void;
  onBack: () => void;
};

const ACTION_LABEL: Record<NonNullable<Flight["action"]>, string> = {
  reroute: "Divert",
  delay: "Delay",
  cancel: "Cancel & rebook",
  hold_for_human_review: "Manual review",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function FlightDetailRail({ flight, onDecision, onBack }: Props) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const originCity = flight.originAirport?.city ?? flight.origin;
  const destCity = flight.destinationAirport?.city ?? flight.destination;
  const hasPlan = flight.status !== "ok";
  const decided = flight.approvalStatus !== undefined && flight.approvalStatus !== "pending";

  const decide = async (kind: "accept" | "reject") => {
    setBusy(kind);
    setNote(null);
    try {
      const result = await (kind === "accept" ? acceptReroute : rejectReroute)(flight.id);
      onDecision(result);
      const verb = kind === "accept" ? "accepted" : "rejected";
      setNote(isMockMode() ? `Plan ${verb} (demo data, not saved to the backend).` : `Plan ${verb}. Recorded for dispatch and ATC review; nothing is sent to the aircraft.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : `${kind === "accept" ? "Accept" : "Reject"} failed.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="rail rail-right">
      <button className="back-link" onClick={onBack}>
        ← All flights
      </button>
      <p className="rail-kicker">Flight detail</p>
      <div className="flight-head">
        <h2 className="callsign">{flight.callsign}</h2>
        <div className="route-line">
          {flight.origin} → {flight.destination}
        </div>
        <span className="status-chip" data-status={flight.status}>
          {flight.action ? `${ACTION_LABEL[flight.action]} · ${flight.status}` : flight.status}
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
        {originCity} to {destCity}.{" "}
        {hasPlan ? "Skyward proposes a recovery plan for review." : "Outside the disruption area; no change proposed."}
      </p>

      <div className="path-compare">
        <div className="path-row original">
          <span className="path-label">Original</span>
          <span>{flight.originalRoute ?? `${flight.origin} → ${flight.destination}`}</span>
        </div>
        {hasPlan && (
          <div className="path-row proposed">
            <span className="path-label">Proposed</span>
            <span>{flight.proposedRoute ?? `${flight.origin} → ${flight.destination}`}</span>
          </div>
        )}
      </div>

      {flight.changes && (
        <div className="change-list">
          <div className="change-item">
            <span className="path-label">Time</span>
            <p>{flight.changes.timing}</p>
            {flight.schedule && (
              <p className="change-meta">
                Arrival {formatTime(flight.schedule.before.arrivalAt)} → {formatTime(flight.schedule.after.arrivalAt)}
              </p>
            )}
          </div>
          <div className="change-item">
            <span className="path-label">Aircraft</span>
            <p>{flight.changes.aircraft}</p>
            {flight.aircraft?.swapped && (
              <p className="change-meta">
                {flight.aircraft.before.id} → {flight.aircraft.after.id} at {flight.aircraft.swapAt}
              </p>
            )}
          </div>
          <div className="change-item">
            <span className="path-label">Layovers</span>
            <p>{flight.changes.layover}</p>
            {flight.stops?.map((stop) => (
              <p key={stop.code} className="change-meta">
                {stop.code} · {stop.groundMinutes} min on the ground, {formatTime(stop.arrivalAt)}–{formatTime(stop.departureAt)}
              </p>
            ))}
          </div>
        </div>
      )}

      {note && <p className="rail-body">{note}</p>}

      {hasPlan && (
        <div className="actions">
          <button className="btn btn-primary" disabled={busy !== null || decided} onClick={() => decide("accept")}>
            {busy === "accept" ? "…" : flight.approvalStatus === "approved" ? "Accepted" : "Accept"}
          </button>
          <button className="btn btn-ghost" disabled={busy !== null || decided} onClick={() => decide("reject")}>
            {busy === "reject" ? "…" : flight.approvalStatus === "rejected" ? "Rejected" : "Reject"}
          </button>
        </div>
      )}
    </aside>
  );
}
