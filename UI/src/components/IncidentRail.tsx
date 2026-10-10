import type { Flight, Incident } from "../types";

type Props = {
  incident: Incident | null;
  flights: Flight[];
};

export function IncidentRail({ incident, flights }: Props) {
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
      <p className="rail-kicker">Active incident</p>
      <h2 className="rail-title">{incident.name}</h2>
      <p className="rail-body">{incident.summary}</p>

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

      <div className="progress">
        <div className="metric-label">Recovery · {pct}%</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="status-pulse">
        <span className="status-dot" aria-hidden />
        <span>{incident.statusLine}</span>
      </div>
    </aside>
  );
}
