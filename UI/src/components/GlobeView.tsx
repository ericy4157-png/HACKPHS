import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { Airport, ArcDatum, Flight, LayoverDatum, PointDatum } from "../types";
import type { SkyMode } from "../hooks/useDayNight";

type Props = {
  flights: Flight[];
  /** Full roster used to draw a selected aircraft's layover chain. */
  roster?: Flight[];
  selectedId: string | null;
  onSelect: (flightId: string | null) => void;
  mode: SkyMode;
  /** Where to frame the camera when the incident changes; defaults to CONUS. */
  focus: { lat: number; lng: number } | null;
  /** False on the dashboard so wheel scroll can carry the story, not zoom the globe. */
  interactive?: boolean;
  /** When true (scroll-lock), wheel zooms the globe instead of driving story scroll. */
  allowZoom?: boolean;
  /** Flights whose plans just rewrote after a decision. */
  changedIds?: string[];
};

// Served from UI/public: three-globe keeps the whole scene hidden until the globe texture loads.
const EARTH_DAY = "/textures/earth-blue-marble.jpg";
const EARTH_NIGHT = "/textures/earth-night.jpg";
const BUMP = "/textures/earth-topology.png";

function statusColor(status: Flight["status"], selected: boolean, changed = false): string {
  if (changed && !selected) return "#ff8a5b";
  if (selected) return "#ffe08a";
  switch (status) {
    case "rerouted":
      return "#5ee1a8";
    case "rerouting":
      return "#e8b84a";
    case "disrupted":
      return "#ff6b4a";
    default:
      return "#9eb6d4";
  }
}

function pathEnds(flight: Flight): [[number, number], [number, number]] | null {
  const path = flight.originalPath;
  if (path && path.length >= 2) {
    return [path[0], path[path.length - 1]];
  }
  const o = flight.originAirport;
  const d = flight.destinationAirport;
  if (o && d) return [[o.lat, o.lng], [d.lat, d.lng]];
  return null;
}

function arcAltitude(kind: ArcDatum["kind"]): number {
  switch (kind) {
    case "proposed":
      return 0.2;
    case "rotation":
      return 0.14;
    case "traffic":
      return 0.06;
    default:
      return 0.1;
  }
}

function arcStroke(kind: ArcDatum["kind"]): number {
  switch (kind) {
    case "proposed":
      return 1.15;
    case "rotation":
      return 1.05;
    case "traffic":
      return 0.28;
    default:
      return 0.55;
  }
}

/** Background traffic for every drawable leg, plus plan arcs; selected tail gets a full rotation chain. */
function buildArcs(flights: Flight[], roster: Flight[], selectedId: string | null): ArcDatum[] {
  const arcs: ArcDatum[] = [];
  const selected = selectedId ? flights.find((f) => f.id === selectedId) ?? roster.find((f) => f.id === selectedId) : null;
  const selectedTail = selected?.aircraftId ?? null;

  for (const f of flights) {
    const isSelected = f.id === selectedId;
    const ends = pathEnds(f);
    if (!ends) continue;
    const [o0, o1] = ends;

    if (f.status === "ok" && !isSelected) {
      // Faint arcs for the active day / window; every plane still has a point marker.
      if (f.inWindow !== false && (f.dayIndex === undefined || f.dayIndex === 0)) {
        arcs.push({
          id: `${f.id}-traffic`,
          flightId: f.id,
          kind: "traffic",
          startLat: o0[0],
          startLng: o0[1],
          endLat: o1[0],
          endLng: o1[1],
          color: "rgba(158,182,212,0.16)",
          dash: true,
        });
      }
      continue;
    }

    arcs.push({
      id: `${f.id}-orig`,
      flightId: f.id,
      kind: "original",
      startLat: o0[0],
      startLng: o0[1],
      endLat: o1[0],
      endLng: o1[1],
      color: isSelected ? "rgba(244,247,251,0.55)" : "rgba(244,247,251,0.28)",
      dash: true,
    });

    // Green reroute arcs only for the selected flight — otherwise the globe fills with
    // unclickable spaghetti from every pending plan.
    const proposed = f.proposedPath;
    if (isSelected && f.status !== "ok" && proposed) {
      for (let i = 0; i < proposed.length - 1; i++) {
        const a = proposed[i];
        const b = proposed[i + 1];
        arcs.push({
          id: `${f.id}-prop-${i}`,
          flightId: f.id,
          kind: "proposed",
          startLat: a[0],
          startLng: a[1],
          endLat: b[0],
          endLng: b[1],
          color: "#5ee1a8",
          dash: false,
        });
      }
    }
  }

  if (!selectedTail) return arcs;

  // Full planned rotation for the selected aircraft — every layover leg in order.
  const rotation = roster
    .filter((leg) => leg.aircraftId === selectedTail)
    .sort(
      (a, b) =>
        new Date(a.departureAt ?? 0).getTime() - new Date(b.departureAt ?? 0).getTime() ||
        (a.legNumber ?? 0) - (b.legNumber ?? 0),
    );

  for (const leg of rotation) {
    const ends = pathEnds(leg);
    if (!ends) continue;
    const [o0, o1] = ends;
    // Skip duplicating the selected leg's original arc if already drawn above.
    if (leg.id === selectedId) continue;
    arcs.push({
      id: `${leg.id}-rotation`,
      flightId: leg.id,
      kind: "rotation",
      startLat: o0[0],
      startLng: o0[1],
      endLat: o1[0],
      endLng: o1[1],
      color: "rgba(255,224,138,0.72)",
      dash: false,
    });
  }

  return arcs;
}

function buildPoints(flights: Flight[], selectedId: string | null, changedIds: Set<string>, selectedTail: string | null): PointDatum[] {
  return flights.map((f) => {
    const selected = f.id === selectedId;
    const onTail = Boolean(selectedTail && f.aircraftId === selectedTail);
    const changed = changedIds.has(f.id);
    return {
      id: f.id,
      flightId: f.id,
      lat: f.lat,
      lng: f.lng,
      callsign: f.callsign,
      status: f.status,
      size: selected ? 0.62 : onTail ? 0.45 : changed ? 0.5 : f.status === "ok" ? 0.34 : 0.4,
      color: onTail && !selected ? "#ffe08a" : statusColor(f.status, selected, changed),
    };
  });
}

function affectedAirports(flights: Flight[]): Airport[] {
  const byCode = new Map<string, Airport>();
  for (const f of flights) {
    if (f.status === "ok") continue;
    for (const view of [f.originAirport, f.destinationAirport]) {
      if (view) byCode.set(view.code, { iata: view.code, name: view.name, city: view.city, lat: view.lat, lng: view.lng });
    }
  }
  return [...byCode.values()];
}

/** Ordered layover airports for the selected tail (connection cities on the rotation). */
function buildLayovers(roster: Flight[], selectedId: string | null): LayoverDatum[] {
  if (!selectedId) return [];
  const selected = roster.find((f) => f.id === selectedId);
  if (!selected?.aircraftId) return [];
  const legs = roster
    .filter((leg) => leg.aircraftId === selected.aircraftId)
    .sort(
      (a, b) =>
        new Date(a.departureAt ?? 0).getTime() - new Date(b.departureAt ?? 0).getTime() ||
        (a.legNumber ?? 0) - (b.legNumber ?? 0),
    );
  if (legs.length < 2) return [];

  const stops: LayoverDatum[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < legs.length - 1; i++) {
    const dest = legs[i].destinationAirport;
    const nextOrig = legs[i + 1].originAirport;
    if (!dest) continue;
    // Connection layover: this arrival feeds the next departure.
    if (nextOrig && dest.code !== nextOrig.code) continue;
    if (seen.has(dest.code)) continue;
    seen.add(dest.code);
    stops.push({
      id: `lay-${selected.aircraftId}-${dest.code}-${i}`,
      code: dest.code,
      name: dest.name,
      city: dest.city,
      lat: dest.lat,
      lng: dest.lng,
      label: `${dest.code} · layover`,
    });
  }
  return stops;
}

export function GlobeView({
  flights,
  roster = [],
  selectedId,
  onSelect,
  mode,
  focus,
  interactive = true,
  allowZoom = false,
  changedIds = [],
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [arcsReady, setArcsReady] = useState(false);

  const rosterSource = roster.length ? roster : flights;
  const selectedTail = useMemo(() => {
    if (!selectedId) return null;
    return (
      flights.find((f) => f.id === selectedId)?.aircraftId ??
      rosterSource.find((f) => f.id === selectedId)?.aircraftId ??
      null
    );
  }, [flights, rosterSource, selectedId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ w: Math.max(1, Math.floor(cr.width)), h: Math.max(1, Math.floor(cr.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setArcsReady(false);
    const t = window.setTimeout(() => setArcsReady(true), 120);
    return () => window.clearTimeout(t);
  }, [flights.length, selectedId]);

  const arcs = useMemo(
    () => (arcsReady ? buildArcs(flights, rosterSource, selectedId) : []),
    [flights, rosterSource, selectedId, arcsReady],
  );
  const changed = useMemo(() => new Set(changedIds), [changedIds]);
  const points = useMemo(
    () => buildPoints(flights, selectedId, changed, selectedTail),
    [flights, selectedId, changed, selectedTail],
  );
  const airports = useMemo(() => affectedAirports(flights), [flights]);
  const layovers = useMemo(() => buildLayovers(rosterSource, selectedId), [rosterSource, selectedId]);
  const pulsePoints = useMemo(() => points.filter((p) => changed.has(p.flightId)), [points, changed]);
  const ringData = useMemo(
    () => [...airports, ...pulsePoints, ...layovers],
    [airports, pulsePoints, layovers],
  );
  const labels = useMemo(() => {
    if (!selectedId) return [];
    const selectedPoint = points.find((p) => p.flightId === selectedId);
    return [
      ...layovers.map((stop) => ({
        id: stop.id,
        flightId: selectedId,
        lat: stop.lat,
        lng: stop.lng,
        callsign: stop.label,
        status: "ok" as const,
        size: 0.2,
        color: "#fff6d8",
      })),
      ...(selectedPoint ? [selectedPoint] : []),
    ];
  }, [selectedId, points, layovers]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = interactive && !selectedId && !allowZoom;
    controls.autoRotateSpeed = 0.28;
    controls.enableDamping = true;
    controls.enableZoom = allowZoom;
    if (allowZoom) {
      controls.minDistance = 120;
      controls.maxDistance = 500;
      controls.zoomSpeed = 0.85;
    }
  }, [selectedId, size.w, interactive, allowZoom]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selectedId) return;
    const f = flights.find((x) => x.id === selectedId) ?? rosterSource.find((x) => x.id === selectedId);
    if (!f) return;
    g.pointOfView({ lat: f.lat, lng: f.lng, altitude: 1.65 }, 1100);
  }, [selectedId, flights, rosterSource]);

  const focusLat = focus?.lat ?? 38;
  const focusLng = focus?.lng ?? -97;
  useEffect(() => {
    const g = globeRef.current;
    if (!g || selectedId) return;
    g.pointOfView({ lat: focusLat, lng: focusLng, altitude: 1.9 }, 900);
  }, [focusLat, focusLng, selectedId]);

  return (
    <div className="globe-stage" ref={wrapRef} data-interactive={interactive}>
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        enablePointerInteraction={interactive}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={mode === "night" ? EARTH_NIGHT : EARTH_DAY}
        bumpImageUrl={BUMP}
        atmosphereColor={mode === "night" ? "#6b8cff" : "#8ec9ff"}
        atmosphereAltitude={0.2}
        arcsData={arcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor={(d: object) => (d as ArcDatum).color}
        arcAltitude={(d: object) => arcAltitude((d as ArcDatum).kind)}
        arcStroke={(d: object) => arcStroke((d as ArcDatum).kind)}
        arcDashLength={(d: object) => {
          const kind = (d as ArcDatum).kind;
          if (kind === "traffic") return 0.2;
          if (kind === "original") return 0.35;
          return 1;
        }}
        arcDashGap={(d: object) => {
          const kind = (d as ArcDatum).kind;
          if (kind === "traffic") return 0.55;
          if (kind === "original") return 0.2;
          return 0;
        }}
        arcDashAnimateTime={(d: object) => {
          const kind = (d as ArcDatum).kind;
          if (kind === "traffic") return 6000;
          if (kind === "original") return 4000;
          if (kind === "rotation") return 0;
          return 0;
        }}
        arcsTransitionDuration={700}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={0.012}
        pointRadius="size"
        pointColor="color"
        pointsMerge={false}
        onPointClick={(p: object) => {
          const pt = p as PointDatum;
          onSelect(pt.flightId === selectedId ? null : pt.flightId);
        }}
        onArcClick={(a: object) => {
          const arc = a as ArcDatum;
          if (!arc.flightId) return;
          onSelect(arc.flightId === selectedId ? null : arc.flightId);
        }}
        ringsData={ringData}
        ringLat="lat"
        ringLng="lng"
        ringColor={(d: object) => {
          if ("code" in d && (d as LayoverDatum).code) {
            return mode === "night" ? "rgba(255,224,138,0.65)" : "rgba(255,210,120,0.55)";
          }
          return mode === "night" ? "rgba(255,180,100,0.55)" : "rgba(255,120,80,0.45)";
        }}
        ringMaxRadius={(d: object) => ("code" in d && (d as LayoverDatum).code ? 1.6 : 2.8)}
        ringPropagationSpeed={1.4}
        ringRepeatPeriod={1400}
        labelsData={labels}
        labelLat="lat"
        labelLng="lng"
        labelText="callsign"
        labelSize={(d: object) => ((d as PointDatum).callsign.includes("layover") ? 0.85 : 1.1)}
        labelDotRadius={0.28}
        labelColor={() => "#fff6d8"}
        labelAltitude={0.025}
        onGlobeClick={() => onSelect(null)}
      />
      <div className="legend">
        <span>
          <i className="swatch traffic" /> Traffic
        </span>
        <span>
          <i className="swatch original" /> Original
        </span>
        <span>
          <i className="swatch proposed" /> Reroute
        </span>
        <span>
          <i className="swatch rotation" /> Tail layovers
        </span>
        <span>
          <i className="swatch flight" /> Flight
        </span>
      </div>
    </div>
  );
}
