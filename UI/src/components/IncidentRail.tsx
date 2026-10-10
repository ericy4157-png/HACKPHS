import type { Flight, Incident } from "../types";

type Props = {
  incident: Incident | null;
  flights: Flight[];
  onNextScenario: () => void;
  advancing: boolean;
};

function formatSimClock(iso?: string, simMinutes?: number): string {
  if (iso) {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (simMinutes != null) return `T+${simMinutes}m`;
  return "—";
}

export function IncidentRail({ incident, flights, onNextScenario, advancing }: Props) {
  if (!incident) {
    return (
      <aside className="rail rail-left">
        <p className="rail-kicker">Incident</p>
        <h2 className="rail-title">Awaiting signal…</h2>
      </aside>
    );
  }

  const affected = flights.filter((f) => f.status !== "ok").length;
  const rerouted = flights.filter((f) => f.status === "rerouted").length;
  const pct = Math.round(incident.recoveryProgress * 100);

  return (
    <aside className="rail rail-left">
      <p className="rail-kicker">
        {incident.baseline
          ? "Network status"
          : `Active incident${incident.scenarioNumber ? ` · scenario ${incident.scenarioNumber}` : ""}`}
      </p>
      <h2 className="rail-title">{incident.name}</h2>
      <p className="rail-body">{incident.region}</p>
      <p className="rail-body">{incident.summary}</p>

      <div className="metric-row">
        <div className="metric">
          <span className="metric-label">Network time</span>
          <span className="metric-value" style={{ fontSize: "0.95rem" }}>
            {formatSimClock(incident.simClockIso, incident.simMinutes)}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Sim +</span>
          <span className="metric-value">{incident.simMinutes ?? 0}m</span>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric">
          <span className="metric-label">Affected</span>
          <span className="metric-value">{affected}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Rerouted</span>
          <span className="metric-value">{rerouted}</span>
        </div>
      </div>

      {incident.lastOpsNote && (
        <p className="rail-body">
          Latest ops: {incident.lastOpsNote}
        </p>
      )}

      <div className="progress">
        <div className="metric-label">Decisions · {pct}%</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="status-pulse">
        <span className="status-dot" aria-hidden />
        <span>{incident.statusLine}</span>
      </div>

      <div className="actions actions-single">
        <button className="btn btn-ghost" disabled={advancing} onClick={onNextScenario}>
          {advancing ? "Loading…" : incident.baseline ? "Simulate disaster" : "Next scenario"}
        </button>
      </div>

      {incident.notice && <p className="rail-footnote">{incident.notice}</p>}
    </aside>
  );
}
