import { useEffect, useMemo, useState } from "react";
import { enableMockMode, getFlight, getFlights, getIncident, getRosterFlights, isMockMode, nextScenario, tickNetwork } from "./api/client";
import { DashboardHero } from "./components/DashboardHero";
import { FlightDetailRail } from "./components/FlightDetailRail";
import { FlightListRail, type ListFilter } from "./components/FlightListRail";
import { FlightSheet } from "./components/FlightSheet";
import { GlobeView } from "./components/GlobeView";
import { ImpactBanner } from "./components/ImpactBanner";
import { IncidentRail } from "./components/IncidentRail";
import { LeftRail } from "./components/LeftRail";
import { SkyShell } from "./components/SkyShell";
import { useDayNight } from "./hooks/useDayNight";
import { useStoryScroll } from "./hooks/useStoryScroll";
import type { LeftTab } from "./pages";
import type { AppPage, DecisionResult, Flight, Incident } from "./types";

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
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [leftTab, setLeftTab] = useState<LeftTab>("operations");
  const [appPage, setAppPage] = useState<AppPage>("dashboard");
  const [roster, setRoster] = useState<Flight[]>([]);
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);
  const [changedFlightIds, setChangedFlightIds] = useState<string[]>([]);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const { progress, layers, scrollTo } = useStoryScroll(scroller);
  const page: AppPage = appPage === "sheet" ? "sheet" : progress > 0.55 ? "network" : "dashboard";
  const inNetwork = page === "network";

  const goDashboard = () => {
    setAppPage("dashboard");
    scrollTo("dashboard");
  };
  const goNetwork = () => {
    setAppPage("network");
    scrollTo("network");
  };
  const goSheet = () => setAppPage("sheet");

  // Globe sits above the scroller in the network so drag still works; wheel still turns the page.
  useEffect(() => {
    if (!scroller) return;
    const shell = scroller.closest(".sky-shell");
    if (!shell) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".rail-left") ||
        target.closest(".sheet") ||
        target.closest(".flight-sheet") ||
        target.closest(".dash-queue") ||
        target.closest(".dash-inspect")
      ) {
        return;
      }
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) return;
      const next = Math.min(max, Math.max(0, scroller.scrollTop + event.deltaY));
      if (next === scroller.scrollTop) return;
      event.preventDefault();
      scroller.scrollTop = next;
    };
    shell.addEventListener("wheel", onWheel, { passive: false });
    return () => shell.removeEventListener("wheel", onWheel);
  }, [scroller]);

  useEffect(() => {
    let cancelled = false;
    const load = () => Promise.all([getIncident(), getFlights(), getRosterFlights()]);
    (async () => {
      try {
        setLoading(true);
        let inc: Incident;
        let fl: Flight[];
        let rosterRows: Flight[];
        const startedInMockMode = isMockMode();
        try {
          [inc, fl, rosterRows] = await load();
        } catch (backendError) {
          if (startedInMockMode) throw backendError;
          // Keep the UI usable without a backend, but say so loudly.
          const reason = backendError instanceof Error ? backendError.message : "unreachable";
          enableMockMode();
          [inc, fl, rosterRows] = await load();
          if (!cancelled) setDemoNotice(`Backend unavailable (${reason}). Showing demo data; decisions are not saved.`);
        }
        if (cancelled) return;
        setIncident(inc);
        setFlights(fl);
        setRoster(rosterRows);
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

  // Live ops clock: while the tab is visible, refresh (and advance the clock in mock mode).
  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    const tickMs = 12_000;

    const run = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        if (isMockMode()) {
          const snapshot = await tickNetwork();
          if (cancelled) return;
          setIncident(snapshot.incident);
          setFlights(snapshot.flights);
          setRoster(snapshot.flights);
          return;
        }
        const [inc, fl, rosterRows] = await Promise.all([getIncident(), getFlights(), getRosterFlights()]);
        if (cancelled) return;
        setIncident(inc);
        setFlights(fl);
        setRoster(rosterRows);
      } catch {
        /* keep last good snapshot; next interval retries */
      }
    };

    const id = window.setInterval(run, tickMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loading, error]);

  const selected = useMemo(
    () => flights.find((f) => f.id === selectedId) ?? null,
    [flights, selectedId],
  );

  useEffect(() => {
    setPreviewPlanId(null);
  }, [selectedId]);

  const openFlight = (id: string) => {
    setSelectedId(id);
    setLeftTab("flights");
    goNetwork();
  };

  const globeFlights = useMemo(() => {
    if (!selectedId || !previewPlanId) return flights;
    return flights.map((flight) => {
      if (flight.id !== selectedId) return flight;
      const alt = flight.alternatives?.find((item) => item.planId === previewPlanId);
      if (!alt) return flight;
      return {
        ...flight,
        proposedPath: alt.proposedPath ?? flight.proposedPath,
        proposedRoute: alt.proposedRoute ?? flight.proposedRoute,
        action: alt.action ?? flight.action,
        delayMinutes: alt.delayMinutes ?? flight.delayMinutes,
        aircraft: alt.aircraft ?? flight.aircraft,
      };
    });
  }, [flights, selectedId, previewPlanId]);

  // Compact markers from scope=active lack route detail; hydrate from GET /api/flights/:id.
  useEffect(() => {
    if (!selectedId) return;
    const current = flights.find((f) => f.id === selectedId);
    if (!current?.compact) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await getFlight(selectedId);
        if (cancelled || !full) return;
        setFlights((list) => list.map((f) => (f.id === selectedId ? full : f)));
      } catch {
        /* keep the compact row; detail rail shows what it can */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, flights]);

  const onDecision = (result: DecisionResult) => {
    const { flight, flights: nextFlights, incident: nextIncident } = result;
    if (nextFlights) setFlights(nextFlights);
    else if (flight) setFlights((current) => current.map((f) => (f.id === flight.id ? flight : f)));
    if (nextIncident) setIncident(nextIncident);
    setChangedFlightIds(result.changedFlightIds ?? []);
    setPreviewPlanId(null);
    setLeftTab("flights");
    void getRosterFlights()
      .then(setRoster)
      .catch(() => {
        /* keep last roster */
      });
  };

  const onNextScenario = async () => {
    setAdvancing(true);
    try {
      const snapshot = await nextScenario();
      setSelectedId(null);
      setPreviewPlanId(null);
      setChangedFlightIds([]);
      setLeftTab("operations");
      setIncident(snapshot.incident);
      setFlights(snapshot.flights);
      setError(null);
      void getRosterFlights()
        .then(setRoster)
        .catch(() => {
          /* keep last roster */
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the next scenario");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <>
      <SkyShell mode={mode} layers={layers} page={page} onBrandClick={goDashboard}>
        <DashboardHero
          key={incident?.id ?? "dash"}
          incident={incident}
          flights={flights}
          onEnterNetwork={goNetwork}
          onOpenSheet={goSheet}
          onDecision={onDecision}
          onInspectFlight={openFlight}
          onReviewDecisions={() => {
            setListFilter("needs_decision");
            setLeftTab("flights");
            goNetwork();
          }}
        />
        {page === "sheet" && (
          <FlightSheet flights={roster.length ? roster : flights} changedIds={changedFlightIds} onBack={goDashboard} />
        )}
        {changedFlightIds.length > 0 && (
          <ImpactBanner
            ids={changedFlightIds}
            flights={flights}
            onOpenFlight={openFlight}
            onDismiss={() => setChangedFlightIds([])}
          />
        )}
        <div className="story-scroll" ref={setScroller} aria-hidden>
          <div className="story-spacer" />
          <div className="story-spacer" />
          <div className="story-spacer" />
        </div>
        <LeftRail
          tab={leftTab}
          onTabChange={(tab) => {
            if (tab === "operations") setSelectedId(null);
            setLeftTab(tab);
          }}
          operations={
            <IncidentRail
              incident={incident}
              flights={flights}
              onNextScenario={onNextScenario}
              advancing={advancing}
            />
          }
          flights={
            selected ? (
              <FlightDetailRail
                key={selected.id}
                flight={selected}
                previewPlanId={previewPlanId}
                onPreviewPlan={setPreviewPlanId}
                onDecision={onDecision}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <FlightListRail
                flights={flights}
                query={listQuery}
                filter={listFilter}
                changedIds={changedFlightIds}
                onQueryChange={setListQuery}
                onFilterChange={setListFilter}
                onSelect={setSelectedId}
              />
            )
          }
        />
        <GlobeView
          flights={globeFlights}
          selectedId={selectedId}
          changedIds={changedFlightIds}
          onSelect={(id) => {
            if (!inNetwork) return;
            setSelectedId(id);
            if (id) setLeftTab("flights");
          }}
          mode={mode}
          focus={incident?.center ?? null}
          interactive={inNetwork}
        />
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
