import { useEffect, useMemo, useState } from "react";
import { enableMockMode, getFlights, getIncident, isMockMode, nextScenario } from "./api/client";
import { FlightDetailRail } from "./components/FlightDetailRail";
import { FlightListRail, type ListFilter } from "./components/FlightListRail";
import { GlobeView } from "./components/GlobeView";
import { IncidentRail } from "./components/IncidentRail";
import { SkyShell } from "./components/SkyShell";
import { useDayNight } from "./hooks/useDayNight";
import type { DecisionResult, Flight, Incident } from "./types";

export default function App() {
  const mode = useDayNight();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("needs_decision");

  useEffect(() => {
    let cancelled = false;
    const load = () => Promise.all([getIncident(), getFlights()]);
    (async () => {
      try {
        setLoading(true);
        let inc: Incident;
        let fl: Flight[];
        const startedInMockMode = isMockMode();
        try {
          [inc, fl] = await load();
        } catch (backendError) {
          if (startedInMockMode) throw backendError;
          // Keep the UI usable without a backend, but say so loudly.
          const reason = backendError instanceof Error ? backendError.message : "unreachable";
          enableMockMode();
          [inc, fl] = await load();
          if (!cancelled) setDemoNotice(`Backend unavailable (${reason}). Showing demo data; decisions are not saved.`);
        }
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

  const onDecision = (result: DecisionResult) => {
    const { flight, incident: nextIncident } = result;
    if (flight) setFlights((current) => current.map((f) => (f.id === flight.id ? flight : f)));
    if (nextIncident) setIncident(nextIncident);
  };

  const onNextScenario = async () => {
    setAdvancing(true);
    try {
      const snapshot = await nextScenario();
      setSelectedId(null);
      setIncident(snapshot.incident);
      setFlights(snapshot.flights);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the next scenario");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <>
      <SkyShell mode={mode}>
        <IncidentRail
          incident={incident}
          flights={flights}
          onNextScenario={onNextScenario}
          advancing={advancing}
        />
        <GlobeView
          flights={flights}
          selectedId={selectedId}
          onSelect={setSelectedId}
          mode={mode}
          focus={incident?.center ?? null}
        />
        {selected ? (
          <FlightDetailRail
            key={selected.id}
            flight={selected}
            onDecision={onDecision}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <FlightListRail
            flights={flights}
            query={listQuery}
            filter={listFilter}
            onQueryChange={setListQuery}
            onFilterChange={setListFilter}
            onSelect={setSelectedId}
          />
        )}
      </SkyShell>
      {demoNotice && (
        <div className="demo-banner" role="status">
          {demoNotice}
          <button className="demo-banner-close" aria-label="Dismiss" onClick={() => setDemoNotice(null)}>
            ×
          </button>
        </div>
      )}
      {loading && <div className="loading-veil">Syncing sky…</div>}
      {error && !loading && <div className="loading-veil">{error}</div>}
    </>
  );
}
