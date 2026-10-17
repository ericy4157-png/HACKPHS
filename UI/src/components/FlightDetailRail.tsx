import { useMemo, useState } from "react";
import { acceptReroute, isMockMode, rejectReroute } from "../api/client";
import { ACTION_LABEL } from "../flightLabels";
import type { DecisionResult, Flight, FlightAlternative } from "../types";

type Props = {
  flight: Flight;
  previewPlanId: string | null;
  onPreviewPlan: (planId: string | null) => void;
  onDecision: (result: DecisionResult) => void;
  onBack: () => void;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function defaultLabel(flight: Flight): string {
  if (flight.label) return flight.label;
  const mins = flight.delayMinutes ?? 0;
  const pax = ((flight.passengers || 0) * mins).toLocaleString("en-US");
  if (flight.action === "delay") return `Delay ${mins}m · ${pax} pax-min`;
  if (flight.action && ACTION_LABEL[flight.action]) return `${ACTION_LABEL[flight.action]} · ${pax} pax-min`;
  return `Proposed · ${pax} pax-min`;
}

/**
 * Selected-flight rail. When sibling futures exist, picking one is preview only until Accept.
 */
export function FlightDetailRail({ flight, previewPlanId, onPreviewPlan, onDecision, onBack }: Props) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const originCity = flight.originAirport?.city ?? flight.origin;
  const destCity = flight.destinationAirport?.city ?? flight.destination;
  const hasPlan = flight.status !== "ok";
  const decided = flight.approvalStatus !== undefined && flight.approvalStatus !== "pending";

  const futures = useMemo(() => {
    const primary: FlightAlternative = {
      planId: flight.planId ?? flight.id,
      action: flight.action,
      delayMinutes: flight.delayMinutes,
      proposedPath: flight.proposedPath,
      proposedRoute: flight.proposedRoute,
      passengerMinutes: flight.passengerMinutes,
      label: defaultLabel(flight),
      layers: flight.layers,
      aircraft: flight.aircraft,
    };
    const alts = flight.alternatives ?? [];
    if (!alts.length) return [];
    return [primary, ...alts];
  }, [flight]);

  const activeId = previewPlanId ?? flight.planId ?? null;
  const preview = futures.find((item) => item.planId === activeId) ?? futures[0] ?? null;
  const proposedRoute = preview?.proposedRoute ?? flight.proposedRoute ?? `${flight.origin} → ${flight.destination}`;

  const decide = async (kind: "accept" | "reject") => {
    setBusy(kind);
    setNote(null);
    try {
      const result = await (kind === "accept" ? acceptReroute(flight.id, preview?.planId) : rejectReroute(flight.id));
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
    <div className="rail-stack">
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
          {flight.action ? `${ACTION_LABEL[flight.action]} · ${decided ? flight.approvalStatus : "awaiting decision"}` : flight.status}
        </span>
      </div>

      <div className="metric-row">
        <div className="metric">
          <span className="metric-label">Delay</span>
          <span className="metric-value">+{preview?.delayMinutes ?? flight.delayMinutes ?? 0}m</span>
        </div>
        <div className="metric">
          <span className="metric-label">Souls</span>
          <span className="metric-value">{flight.passengers}</span>
        </div>
      </div>

      <p className="rail-body">
        {originCity} to {destCity}.{" "}
        {hasPlan ? "Compare legal futures, then accept one. Nothing is sent to the aircraft." : "Outside the disruption area; no change proposed."}
      </p>

      {futures.length > 1 && !decided && (
        <div className="future-picker" role="listbox" aria-label="Recovery futures">
          {futures.map((option) => (
            <button
              key={option.planId}
              type="button"
              role="option"
              aria-selected={option.planId === activeId}
              className="future-option"
              data-active={option.planId === activeId}
              onClick={() => onPreviewPlan(option.planId)}
            >
              <span className="future-option-action">{option.action ? ACTION_LABEL[option.action] : "Plan"}</span>
              <span className="future-option-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="path-compare">
        <div className="path-row original">
          <span className="path-label">Original</span>
          <span>{flight.originalRoute ?? `${flight.origin} → ${flight.destination}`}</span>
        </div>
        {hasPlan && (
          <div className="path-row proposed">
            <span className="path-label">Proposed</span>
            <span>{proposedRoute}</span>
          </div>
        )}
      </div>

      {flight.supersededReason && !decided && (
        <p className="rail-body">Plan updated because {flight.supersededReason}.</p>
      )}

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
            {(preview?.aircraft ?? flight.aircraft)?.swapped && (
              <p className="change-meta">
                {(preview?.aircraft ?? flight.aircraft)!.before.id} → {(preview?.aircraft ?? flight.aircraft)!.after.id} at {(preview?.aircraft ?? flight.aircraft)!.swapAt}
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

      {(preview?.layers ?? flight.layers) && (preview?.layers ?? flight.layers)!.length > 1 && (
        <div className="change-list">
          <div className="change-item">
            <span className="path-label">Knock-on</span>
            {(preview?.layers ?? flight.layers)!
              .filter((layer) => layer.index > 0)
              .slice(0, 6)
              .map((layer) => (
                <p key={`${layer.index}-${layer.kind}-${layer.flightId || layer.groupId}`} className="change-meta">
                  {layer.summary}
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
    </div>
  );
}
