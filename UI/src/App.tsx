import { useEffect, useMemo, useState } from "react";
import { getFlights, getIncident } from "./api/client";
import { FlightDetailRail } from "./components/FlightDetailRail";
import { GlobeView } from "./components/GlobeView";
import { IncidentRail } from "./components/IncidentRail";
import { SkyShell } from "./components/SkyShell";
import { useDayNight } from "./hooks/useDayNight";
import type { Flight, Incident } from "./types";

export default function App() {
  const mode = useDayNight();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [inc, fl] = await Promise.all([getIncident(), getFlights()]);
        if (cancelled) return;
        setIncident(inc);
        setFlights(fl);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => flights.find((f) => f.id === selectedId) ?? null,
    [flights, selectedId],
  );

  return (
    <>
      <SkyShell mode={mode}>
        <IncidentRail incident={incident} flights={flights} />
        <GlobeView
          flights={flights}
          selectedId={selectedId}
          onSelect={setSelectedId}
          mode={mode}
        />
        <FlightDetailRail flight={selected} />
      </SkyShell>
      {loading && <div className="loading-veil">Syncing sky…</div>}
      {error && !loading && <div className="loading-veil">{error}</div>}
    </>
  );
}
