import { useMemo, useState } from "react";
import { acceptReroute, isMockMode, rejectReroute } from "../api/client";
import { ACTION_LABEL, affectedHow, needsDecision } from "../flightLabels";
import type { DecisionResult, Flight, FlightAlternative, Incident, RecoveryLayer } from "../types";

type Props = {
  incident: Incident | null;
  flights: Flight[];
  onEnterNetwork: () => void;
  onReviewDecisions: () => void;
  onOpenSheet: () => void;
  onDecision: (result: DecisionResult) => void;
  onInspectFlight: (id: string) => void;
};

type CardExit = {
  id: string;
  kind: "accept" | "reject" | "skip";
  ripples: Ripple[];
};

type Ripple = {
  id: string;
  callsign: string;
  summary: string;
};

type InspectKind = "affected" | "queue";

function formatClock(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function suggestedFuture(flight: Flight): FlightAlternative {
  const primary: FlightAlternative = {
    planId: flight.planId ?? flight.id,
    action: flight.action,
    delayMinutes: flight.delayMinutes,
    proposedRoute: flight.proposedRoute,
    passengerMinutes: flight.passengerMinutes,
    label: flight.label,
    aircraft: flight.aircraft,
    layers: flight.layers,
  };
  const options = [primary, ...(flight.alternatives ?? [])].filter((item) => item.planId);
  return [...options].sort((a, b) => (a.passengerMinutes ?? Infinity) - (b.passengerMinutes ?? Infinity))[0] ?? primary;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function motionMs(full: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : full;
}

function layerRipples(layers: RecoveryLayer[] | undefined, flights: Flight[], selfId: string): Ripple[] {
  return (layers ?? [])
    .filter((layer) => layer.index > 0 && layer.flightId && layer.flightId !== selfId && !layer.absorbed)
    .map((layer) => {
      const match = flights.find((flight) => flight.id === layer.flightId);
      return {
        id: layer.flightId!,
        callsign: match?.callsign ?? layer.flightId!,
        summary: layer.summary,
      };
    });
}

function tailRipples(card: Flight, flights: Flight[]): Ripple[] {
  if (!card.aircraftId) return [];
  return flights
    .filter((flight) => flight.id !== card.id && flight.aircraftId === card.aircraftId && needsDecision(flight))
    .slice(0, 4)
    .map((flight) => ({
      id: flight.id,
      callsign: flight.callsign,
      summary: `Same tail ${card.aircraftId} — ${affectedHow(flight)}`,
    }));
}

function uniqueRipples(items: Ripple[]): Ripple[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildBriefing(incident: Incident | null, pending: Flight[], affected: number, souls: number): string[] {
  const lines: string[] = [];
  if (!incident) {
    lines.push("Waiting on the live ops picture.");
  } else if (incident.baseline) {
    lines.push("No major disaster on the board. The network is on a normal-ops clock.");
  } else {
    lines.push(`${incident.name} is active over ${incident.region}.`);
    if (incident.summary) lines.push(incident.summary);
  }
  if (pending.length === 0) {
    lines.push("No flights are waiting on a human decision.");
  } else {
    lines.push(
      `${pending.length} flight${pending.length === 1 ? "" : "s"} need attention, covering ${souls.toLocaleString("en-US")} passengers.`,
    );
  }
  if (affected > pending.length) {
    lines.push(`${affected - pending.length} other affected flight${affected - pending.length === 1 ? "" : "s"} already have a recorded decision.`);
  }
  return lines;
}

/**
 * Operator home: a few live numbers, a generated rundown, and one approval card at a time.
 */
export function DashboardHero({
  incident,
  flights,
  onEnterNetwork,
  onReviewDecisions: _onReviewDecisions,
  onOpenSheet,
  onDecision,
  onInspectFlight,
}: Props) {
  const pending = useMemo(
    () =>
      flights
        .filter(needsDecision)
        .sort((a, b) => b.passengers - a.passengers || (b.delayMinutes ?? 0) - (a.delayMinutes ?? 0)),
    [flights],
  );
  const [skipIds, setSkipIds] = useState<string[]>([]);
  const [exit, setExit] = useState<CardExit | null>(null);
  const [enterKey, setEnterKey] = useState(0);
  const [inspect, setInspect] = useState<InspectKind | null>(null);
  const queue = pending.filter((flight) => !skipIds.includes(flight.id) && flight.id !== exit?.id);
  const card = (exit ? flights.find((flight) => flight.id === exit.id) : null) ?? queue[0] ?? null;
  const suggestion = card ? suggestedFuture(card) : null;

  const affectedFlights = flights.filter((flight) => flight.status !== "ok");
  const affected = affectedFlights.length;
  const souls = pending.reduce((sum, flight) => sum + (flight.passengers || 0), 0);
  const decided = flights.filter(
    (flight) => flight.approvalStatus === "approved" || flight.approvalStatus === "rejected",
  ).length;
  const briefing = buildBriefing(incident, pending, affected, souls);
  const inbox = incident?.lastOpsNote ?? null;
  const bulletin = incident?.statusLine ?? null;
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const predicted = card
    ? uniqueRipples([...layerRipples(suggestion?.layers ?? card.layers, flights, card.id), ...tailRipples(card, flights)])
    : [];
  const shownRipples = exit?.ripples.length ? exit.ripples : predicted;
  const inspectRows = inspect === "queue" ? pending : affectedFlights;

  const finishExit = (id: string) => {
    setSkipIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setExit(null);
    setEnterKey((value) => value + 1);
  };

  const decide = async (kind: "accept" | "reject") => {
    if (!card || busy) return;
    setBusy(kind);
    setNote(null);
    try {
      const result = await (kind === "accept" ? acceptReroute(card.id, suggestion?.planId) : rejectReroute(card.id));
      const ripples = uniqueRipples(
        (result.changedFlightIds ?? []).map((id) => {
          const match = (result.flights ?? flights).find((flight) => flight.id === id);
          return {
            id,
            callsign: match?.callsign ?? id,
            summary: match ? affectedHow(match) : "Plan rewritten by this approval",
          };
        }),
      );
      setExit({ id: card.id, kind, ripples });
      const verb = kind === "accept" ? "accepted" : "declined";
      setNote(isMockMode() ? `${card.callsign} ${verb} (demo).` : `${card.callsign} ${verb}. Nothing was sent to the aircraft.`);
      await wait(motionMs(420));
      onDecision(result);
      finishExit(card.id);
    } catch (error) {
      setNote(error instanceof Error ? error.message : `${kind} failed.`);
      setExit(null);
    } finally {
      setBusy(null);
    }
  };

  const skipCard = async () => {
    if (!card || busy) return;
    setExit({ id: card.id, kind: "skip", ripples: [] });
    await wait(motionMs(280));
    finishExit(card.id);
  };

  return (
    <section className="dash-studio" aria-label="Dashboard">
      <div className="swoosh-layer" aria-hidden>
        <svg className="swoosh-svg" viewBox="0 0 1200 800" preserveAspectRatio="none">
          <path className="swoosh-stroke swoosh-a" d="M-40 620 C 180 540, 260 210, 520 260 S 820 90, 1280 140" pathLength="1" />
          <path className="swoosh-stroke swoosh-b" d="M-20 180 C 240 120, 380 420, 640 380 S 960 620, 1240 480" pathLength="1" />
          <path className="swoosh-stroke swoosh-c" d="M 80 780 C 340 640, 520 520, 720 400 S 980 220, 1220 80" pathLength="1" />
        </svg>
        <div className="swoosh-bloom" />
      </div>

      <div className="dash-tablet">
        <div className="dash-main dash-ops">
          <header className="dash-top">
            <div>
              <p className="dash-logo">Skyward</p>
              <h1 className="dash-heading">Dashboard</h1>
            </div>
            <div className="dash-top-tools">
              <button type="button" className="dash-ghost" onClick={onOpenSheet}>
                Flight sheet
              </button>
              <button type="button" className="dash-enter" onClick={onEnterNetwork}>
                Enter the network
              </button>
            </div>
          </header>

          <div className="dash-toolbar">
            <button type="button" className="dash-hero-stat" onClick={() => setInspect("queue")}>
              <p className="dash-kicker">To approve</p>
              <p className="dash-value">{pending.length}</p>
              <p className="dash-stat-note">Still in the human queue</p>
            </button>
            <div className="dash-hero-stat" role="status">
              <p className="dash-kicker">Passengers</p>
              <p className="dash-value">{souls.toLocaleString("en-US")}</p>
              <p className="dash-stat-note">On flights waiting for a decision</p>
            </div>
            <button type="button" className="dash-hero-stat" onClick={() => setInspect("affected")}>
              <p className="dash-kicker">Affected</p>
              <p className="dash-value">{affected}</p>
              <p className="dash-stat-note">{incident?.baseline ? "Ordinary ops noise" : (incident?.name ?? "No signal")}</p>
            </button>
            <div className="dash-hero-stat" role="status">
              <p className="dash-kicker">Handled</p>
              <p className="dash-value">{decided}</p>
              <p className="dash-stat-note">{formatClock(incident?.simClockIso)} · sim +{incident?.simMinutes ?? 0}m</p>
            </div>
          </div>

          <div className="dash-ops-grid">
            <article className="dash-card dash-brief" data-cell="brief">
              <p className="dash-kicker">Situation rundown</p>
              <h2 className="dash-situation">{incident?.baseline ? "Normal operations" : (incident?.name ?? "Awaiting signal")}</h2>
              <ul className="dash-brief-list">
                {briefing.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {pending.length > 0 ? (
                <button type="button" className="dash-brief-link" onClick={() => setInspect("queue")}>
                  Review the {pending.length} flight{pending.length === 1 ? "" : "s"} that need a decision
                </button>
              ) : null}
              {affected > 0 ? (
                <button type="button" className="dash-brief-link" onClick={() => setInspect("affected")}>
                  See how {affected} flight{affected === 1 ? " is" : "s are"} affected
                </button>
              ) : null}
              <div className="dash-mail">
                <p className="dash-kicker">Inbox</p>
                {inbox ? <p className="dash-mail-item">{inbox}</p> : <p className="dash-stat-note">No new ops notes this tick.</p>}
                {bulletin ? (
                  <p className="dash-mail-item dash-mail-bulletin">
                    <span className="dash-kicker">Dispatch</span>
                    {bulletin}
                  </p>
                ) : null}
              </div>
            </article>

            <article className="dash-card dash-queue" data-cell="queue" aria-label="Approval queue">
              <div className="dash-queue-head">
                <p className="dash-kicker">Approval card</p>
                <p className="dash-stat-note">
                  {card ? `${pending.length - queue.length + (exit ? 0 : 1)} of ${pending.length}` : "Queue clear"}
                </p>
              </div>

              {card && suggestion ? (
                <div key={`${enterKey}-${card.id}`} className="dash-queue-card" data-exit={exit?.kind ?? undefined}>
                  <p className="dash-queue-callsign">{card.callsign}</p>
                  <p className="dash-queue-route">
                    {card.origin} → {card.destination}
                  </p>
                  <p className="status-chip" data-status={card.status}>
                    {suggestion.action ? ACTION_LABEL[suggestion.action] : "Plan"} ·{" "}
                    {exit?.kind === "accept" ? "approved" : exit?.kind === "reject" ? "declined" : "awaiting decision"}
                  </p>
                  <dl className="dash-queue-meta">
                    <div>
                      <dt>Suggested</dt>
                      <dd>{suggestion.label ?? `${suggestion.action ?? "plan"} · +${suggestion.delayMinutes ?? 0}m`}</dd>
                    </div>
                    <div>
                      <dt>Was</dt>
                      <dd>{card.originalRoute ?? `${card.origin} → ${card.destination}`}</dd>
                    </div>
                    <div>
                      <dt>Proposed</dt>
                      <dd>{suggestion.proposedRoute ?? card.proposedRoute ?? "Same track"}</dd>
                    </div>
                    <div>
                      <dt>Souls</dt>
                      <dd>{card.passengers}</dd>
                    </div>
                  </dl>
                  {shownRipples.length > 0 ? (
                    <div className="dash-ripple">
                      <p className="dash-kicker">Also affects {shownRipples.length} flight{shownRipples.length === 1 ? "" : "s"}</p>
                      <ul>
                        {shownRipples.slice(0, 4).map((item) => (
                          <li key={item.id}>
                            <button type="button" className="dash-ripple-row" onClick={() => onInspectFlight(item.id)}>
                              <strong>{item.callsign}</strong>
                              <span>{item.summary}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="dash-stat-note">No other pending plan is expected to move if you approve this.</p>
                  )}
                  {note ? <p className="dash-stat-note">{note}</p> : null}
                  <div className="dash-queue-actions">
                    <button type="button" className="btn btn-primary" disabled={busy !== null || Boolean(exit)} onClick={() => void decide("accept")}>
                      {busy === "accept" ? "…" : "Approve"}
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={busy !== null || Boolean(exit)} onClick={() => void decide("reject")}>
                      {busy === "reject" ? "…" : "Decline"}
                    </button>
                    <button type="button" className="dash-ghost" disabled={busy !== null || Boolean(exit)} onClick={() => void skipCard()}>
                      Skip
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dash-queue-empty">
                  <p className="dash-situation">Nothing waiting</p>
                  <p className="dash-stat-note">The approval queue is clear. Watch the globe or open the sheet.</p>
                  {note ? <p className="dash-stat-note">{note}</p> : null}
                </div>
              )}
            </article>
          </div>
        </div>

        {inspect ? (
          <div className="dash-inspect" role="dialog" aria-label={inspect === "queue" ? "Flights that need a decision" : "Affected flights"}>
            <div className="dash-inspect-head">
              <div>
                <p className="dash-kicker">{inspect === "queue" ? "Needs a decision" : "How they were affected"}</p>
                <h2 className="dash-situation">
                  {inspectRows.length} flight{inspectRows.length === 1 ? "" : "s"}
                </h2>
              </div>
              <button type="button" className="dash-ghost" onClick={() => setInspect(null)}>
                Close
              </button>
            </div>
            <ul className="dash-inspect-list">
              {inspectRows.map((flight) => (
                <li key={flight.id}>
                  <button
                    type="button"
                    className="dash-inspect-row"
                    onClick={() => {
                      setInspect(null);
                      onInspectFlight(flight.id);
                    }}
                  >
                    <strong>{flight.callsign}</strong>
                    <span>
                      {flight.origin} → {flight.destination}
                    </span>
                    <span>{affectedHow(flight)}</span>
                    {flight.proposedRoute && flight.proposedRoute !== flight.originalRoute ? (
                      <span>{flight.proposedRoute}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
