import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { Airport, ArcDatum, Flight, PointDatum } from "../types";
import type { SkyMode } from "../hooks/useDayNight";
import { AIRPORT_LIST } from "../data/airports";

type Props = {
  flights: Flight[];
  selectedId: string | null;
  onSelect: (flightId: string | null) => void;
  mode: SkyMode;
};

const EARTH_DAY = "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
const EARTH_NIGHT = "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg";
const BUMP = "//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

function statusColor(status: Flight["status"], selected: boolean): string {
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

function buildArcs(flights: Flight[], selectedId: string | null): ArcDatum[] {
  const arcs: ArcDatum[] = [];
  for (const f of flights) {
    const selected = f.id === selectedId;
    const showAll = !selectedId || selected;
    if (!showAll && f.status === "ok") continue;

    const o0 = f.originalPath[0];
    const o1 = f.originalPath[f.originalPath.length - 1];
    arcs.push({
      id: `${f.id}-orig`,
      flightId: f.id,
      kind: "original",
      startLat: o0[0],
      startLng: o0[1],
      endLat: o1[0],
      endLng: o1[1],
      color: selected ? "rgba(244,247,251,0.55)" : "rgba(244,247,251,0.18)",
      dash: true,
    });

    if (f.status !== "ok") {
      for (let i = 0; i < f.proposedPath.length - 1; i++) {
        const a = f.proposedPath[i];
        const b = f.proposedPath[i + 1];
        arcs.push({
          id: `${f.id}-prop-${i}`,
          flightId: f.id,
          kind: "proposed",
          startLat: a[0],
          startLng: a[1],
          endLat: b[0],
          endLng: b[1],
          color: selected ? "#5ee1a8" : "rgba(94,225,168,0.45)",
          dash: false,
        });
      }
    }
  }
  return arcs;
}

function buildPoints(flights: Flight[], selectedId: string | null): PointDatum[] {
  return flights.map((f) => {
    const selected = f.id === selectedId;
    return {
      id: f.id,
      flightId: f.id,
      lat: f.lat,
      lng: f.lng,
      callsign: f.callsign,
      status: f.status,
      size: selected ? 0.55 : 0.28,
      color: statusColor(f.status, selected),
    };
  });
}

function affectedAirports(flights: Flight[]): Airport[] {
  const codes = new Set<string>();
  for (const f of flights) {
    if (f.status === "ok") continue;
    codes.add(f.origin);
    codes.add(f.destination);
  }
  return AIRPORT_LIST.filter((a) => codes.has(a.iata));
}

export function GlobeView({ flights, selectedId, onSelect, mode }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [arcsReady, setArcsReady] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ w: Math.max(320, cr.width), h: Math.max(320, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setArcsReady(false);
    const t = window.setTimeout(() => setArcsReady(true), 120);
    return () => window.clearTimeout(t);
  }, [flights.length]);

  const arcs = useMemo(
    () => (arcsReady ? buildArcs(flights, selectedId) : []),
    [flights, selectedId, arcsReady],
  );
  const points = useMemo(() => buildPoints(flights, selectedId), [flights, selectedId]);
  const airports = useMemo(() => affectedAirports(flights), [flights]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.controls().autoRotate = !selectedId;
    g.controls().autoRotateSpeed = 0.35;
    g.controls().enableDamping = true;
  }, [selectedId, size.w]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selectedId) return;
    const f = flights.find((x) => x.id === selectedId);
    if (!f) return;
    g.pointOfView({ lat: f.lat, lng: f.lng, altitude: 1.55 }, 1100);
  }, [selectedId, flights]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    // Initial framing over CONUS
    g.pointOfView({ lat: 38, lng: -97, altitude: 1.9 }, 0);
  }, []);

  return (
    <div className="globe-stage" ref={wrapRef}>
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={mode === "night" ? EARTH_NIGHT : EARTH_DAY}
        bumpImageUrl={BUMP}
        atmosphereColor={mode === "night" ? "#6b8cff" : "#8ec9ff"}
        atmosphereAltitude={0.18}
        arcsData={arcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor={(d: object) => (d as ArcDatum).color}
        arcAltitude={(d: object) => ((d as ArcDatum).kind === "proposed" ? 0.18 : 0.1)}
        arcStroke={(d: object) => ((d as ArcDatum).kind === "proposed" ? 1.1 : 0.55)}
        arcDashLength={(d: object) => ((d as ArcDatum).dash ? 0.35 : 1)}
        arcDashGap={(d: object) => ((d as ArcDatum).dash ? 0.2 : 0)}
        arcDashAnimateTime={(d: object) => ((d as ArcDatum).dash ? 4000 : 0)}
        arcsTransitionDuration={900}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={0.01}
        pointRadius="size"
        pointColor="color"
        pointsMerge={false}
        onPointClick={(p: object) => {
          const pt = p as PointDatum;
          onSelect(pt.flightId === selectedId ? null : pt.flightId);
        }}
        ringsData={airports}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => (mode === "night" ? "rgba(255,180,100,0.55)" : "rgba(255,120,80,0.45)")}
        ringMaxRadius={2.8}
        ringPropagationSpeed={1.4}
        ringRepeatPeriod={1400}
        labelsData={selectedId ? points.filter((p) => p.flightId === selectedId) : []}
        labelLat="lat"
        labelLng="lng"
        labelText="callsign"
        labelSize={1.1}
        labelDotRadius={0.3}
        labelColor={() => "#fff6d8"}
        labelAltitude={0.02}
        onGlobeClick={() => onSelect(null)}
      />
      <div className="legend">
        <span>
          <i className="swatch original" /> Original
        </span>
        <span>
          <i className="swatch proposed" /> Reroute
        </span>
        <span>
          <i className="swatch flight" /> Flight
        </span>
      </div>
    </div>
  );
}
