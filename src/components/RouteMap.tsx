"use client";
import { useEffect, useRef, useState } from "react";
import { Map as MlMap, Marker as MlMarker, Popup, NavigationControl, GeolocateControl, LngLatBounds, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { ReachResult } from "@/lib/reach";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Leg } from "@/lib/router";
import type { Place } from "@/lib/types";
import type { Weather } from "@/app/api/weather/route";

export interface OutageMarker { lon: number; lat: number; station: string; detail: string }
export interface MapProps {
  from: [number, number] | null; to: [number, number] | null;
  legs: Leg[] | null; ghostLegs: Leg[] | null;
  badge: string | null;
  outages: OutageMarker[]; places: Place[];
  weather: Weather | null;
  onPick: (p: [number, number]) => void;
  onLocate?: (p: [number, number]) => void;
  /** reach cells to shade instead of a route */
  reach?: ReachResult | null;
}

const STYLES = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" } as const;
type StyleKey = keyof typeof STYLES;
const CENTER: [number, number] = [-79.3835, 43.6512];

// Deliberate, warm-leaning semantic set — these are the only colours in the product, and each
// one means something. The interface itself stays ink on neutrals so they never compete.
// The walking ramp runs sheltered -> exposed and deliberately avoids green and yellow,
// which belong to TTC Lines 2 and 1 and would otherwise collide on the same map.
const COLORS = { indoor: "#2b5fa8", covered: "#3d7f96", shaded: "#5b4b8a", exposed: "#c2410c", transit: { "1": "#e5b611", "2": "#12823f", "4": "#8f2060" } as Record<string, string> };
const INK = "#17150f", PAPER = "#f4f2eb";
const legColor = (l: Leg) => (l.transit ? COLORS.transit[l.transit] ?? "#64748b" : l.shelter === 2 ? COLORS.indoor : l.shelter === 1 ? COLORS.covered : l.sun < 0.35 ? COLORS.shaded : COLORS.exposed);

function feature(l: Leg, coords: [number, number][]): Feature<LineString> {
  return { type: "Feature", properties: { color: legColor(l), steps: l.steps, isTransit: !!l.transit }, geometry: { type: "LineString", coordinates: coords } };
}
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

/** legs clipped to the first `p` (0..1) of the route, so the line can draw itself in */
function partial(legs: Leg[] | null, p: number): FeatureCollection {
  if (!legs?.length) return empty;
  if (p >= 1) return { type: "FeatureCollection", features: legs.map((l) => feature(l, l.coords)) };
  const total = legs.reduce((s, l) => s + Math.max(l.len, 1), 0);
  let budget = total * p;
  const out: Feature<LineString>[] = [];
  for (const l of legs) {
    const len = Math.max(l.len, 1);
    if (budget <= 0) break;
    if (budget >= len) { out.push(feature(l, l.coords)); budget -= len; continue; }
    const frac = budget / len, n = l.coords.length;
    const cut = Math.max(1, Math.round(frac * (n - 1)));
    out.push(feature(l, l.coords.slice(0, cut + 1)));
    budget = 0;
  }
  return { type: "FeatureCollection", features: out };
}
function ghostGeo(legs: Leg[] | null): FeatureCollection {
  return { type: "FeatureCollection", features: (legs ?? []).map((l) => feature(l, l.coords)) };
}
/** dots where the trip changes character: entering a station, boarding, or leaving transit */
function waypoints(legs: Leg[] | null): FeatureCollection {
  if (!legs?.length) return empty;
  const feats: Feature<Point>[] = [];
  legs.forEach((l, i) => {
    const prev = legs[i - 1];
    const changed = i > 0 && (!!l.transit !== !!prev.transit || (l.transit && prev.transit && l.transit !== prev.transit));
    if (changed) feats.push({ type: "Feature", properties: { label: l.station ?? l.name ?? "" }, geometry: { type: "Point", coordinates: l.coords[0] } });
  });
  return { type: "FeatureCollection", features: feats };
}
function placesGeo(places: Place[]): FeatureCollection {
  return { type: "FeatureCollection", features: places.filter((p) => p.lon !== null).map((p) => ({ type: "Feature", properties: { kind: p.kind, name: p.name, type: p.type, address: p.address, hours: Object.entries(p.hours).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") }, geometry: { type: "Point", coordinates: [p.lon as number, p.lat as number] } })) };
}
/** one square per reached grid cell, carrying its travel time for the opacity ramp */
function reachGeo(r: ReachResult | null | undefined, which: "cells" | "lost"): FeatureCollection {
  if (!r) return empty;
  const [dx, dy] = r.cellDeg;
  const sq = (c: [number, number, number, number]): Feature<Polygon> => ({ type: "Feature", properties: { t: c[2], frac: c[2] / r.maxS }, geometry: { type: "Polygon", coordinates: [[[c[0] - dx / 2, c[1] - dy / 2], [c[0] + dx / 2, c[1] - dy / 2], [c[0] + dx / 2, c[1] + dy / 2], [c[0] - dx / 2, c[1] + dy / 2], [c[0] - dx / 2, c[1] - dy / 2]]] } });
  return { type: "FeatureCollection", features: r[which].map(sq) };
}
function midpoint(legs: Leg[] | null): [number, number] | null {
  if (!legs?.length) return null;
  const total = legs.reduce((s, l) => s + l.len, 0); let acc = 0;
  for (const l of legs) { if (acc + l.len >= total / 2) return l.coords[Math.floor(l.coords.length / 2)]; acc += l.len; }
  return legs[legs.length - 1].coords[0];
}

export default function RouteMap({ from, to, legs, ghostLegs, badge, outages, places, weather, onPick, onLocate, reach }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<MlMarker[]>([]);
  const badgeMarker = useRef<MlMarker | null>(null);
  const anim = useRef<number | null>(null);
  const pickRef = useRef(onPick);
  const locateRef = useRef(onLocate);
  useEffect(() => { pickRef.current = onPick; locateRef.current = onLocate; }, [onPick, onLocate]);
  const [styleKey, setStyleKey] = useState<StyleKey>("light");
  const [styleReady, setStyleReady] = useState(0);
  const [noSidewalk, setNoSidewalk] = useState(false);
  const noSidewalkData = useRef<FeatureCollection | null>(null);

  /** the base map is toned down so the route is the brightest thing on screen */
  const mute = (m: MlMap, key: StyleKey) => {
    const dark = key === "dark";
    for (const layer of m.getStyle().layers ?? []) {
      const id = layer.id;
      if (id.startsWith("route") || id.startsWith("reach") || id === "ghost" || id === "places" || id === "waypoints" || id === "nosidewalk") continue;
      try {
        if (layer.type === "symbol") { m.setPaintProperty(id, "text-opacity", dark ? 0.8 : 0.62); m.setPaintProperty(id, "icon-opacity", 0.45); }
        else if (layer.type === "line") m.setPaintProperty(id, "line-opacity", dark ? 0.9 : 0.62);
        else if (layer.type === "fill" && !/water/.test(id)) m.setPaintProperty(id, "fill-opacity", dark ? 0.9 : 0.55);
      } catch { /* layer without that property */ }
    }
  };

  const addArrowImage = (m: MlMap) => {
    if (m.hasImage("dir-arrow")) return;
    const s = 24, c = document.createElement("canvas"); c.width = c.height = s;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.beginPath(); ctx.moveTo(7, 4); ctx.lineTo(18, 12); ctx.lineTo(7, 20);
    ctx.lineWidth = 3.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    m.addImage("dir-arrow", ctx.getImageData(0, 0, s, s), { pixelRatio: 2 });
  };

  const addLayers = (m: MlMap, key: StyleKey) => {
    addArrowImage(m);
    mute(m, key);
    if (m.getSource("route")) return;
    const halo = key === "dark" ? "#111009" : "#ffffff";
    m.addSource("ghost", { type: "geojson", data: empty });
    m.addLayer({ id: "ghost", type: "line", source: "ghost", paint: { "line-color": key === "dark" ? "#6b6559" : "#a8a294", "line-width": 4.5, "line-dasharray": [1.3, 1.5], "line-opacity": 0.85 }, layout: { "line-cap": "round", "line-join": "round" } });
    m.addSource("reach-lost", { type: "geojson", data: empty });
    m.addLayer({ id: "reach-lost", type: "fill", source: "reach-lost", paint: { "fill-color": "#a8331f", "fill-opacity": 0.28, "fill-antialias": false } });
    m.addSource("reach", { type: "geojson", data: empty });
    m.addLayer({ id: "reach", type: "fill", source: "reach", paint: { "fill-color": INK, "fill-opacity": ["interpolate", ["linear"], ["get", "frac"], 0, 0.55, 1, 0.12], "fill-antialias": false } });
    m.addSource("nosidewalk", { type: "geojson", data: empty });
    m.addLayer({ id: "nosidewalk", type: "line", source: "nosidewalk", paint: { "line-color": "#a8331f", "line-width": 2.2, "line-dasharray": [2, 1.6], "line-opacity": 0.85 }, layout: { "line-cap": "round", "line-join": "round", visibility: "none" } });
    m.addSource("route", { type: "geojson", data: empty });
    m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": halo, "line-width": 12, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } });
    m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": ["case", ["get", "isTransit"], 8, 7], "line-color": ["get", "color"] } });
    m.addLayer({ id: "route-steps", type: "line", source: "route", filter: ["==", ["get", "steps"], true], paint: { "line-color": "#dc2626", "line-width": 3.5, "line-dasharray": [0.5, 1.1] } });
    m.addLayer({ id: "route-arrows", type: "symbol", source: "route", layout: { "symbol-placement": "line", "symbol-spacing": 88, "icon-image": "dir-arrow", "icon-size": 0.75, "icon-allow-overlap": true, "icon-rotation-alignment": "map" } });
    m.addSource("waypoints", { type: "geojson", data: empty });
    m.addLayer({ id: "waypoints", type: "circle", source: "waypoints", paint: { "circle-radius": 5, "circle-color": halo, "circle-stroke-color": key === "dark" ? PAPER : INK, "circle-stroke-width": 2.5 } });
    m.addSource("places", { type: "geojson", data: empty });
    m.addLayer({ id: "places", type: "circle", source: "places", paint: { "circle-radius": 5, "circle-color": ["match", ["get", "kind"], "cool", "#0891b2", "warm", "#ea580c", "#64748b"], "circle-stroke-color": halo, "circle-stroke-width": 1.5, "circle-opacity": 0.9 } });
    m.on("click", "places", (e) => { const f = e.features?.[0]; if (!f) return; const p = f.properties as Record<string, string>; new Popup({ offset: 10, closeButton: false }).setLngLat(e.lngLat).setHTML(`<div style="font:13px/1.45 system-ui"><strong>${p.name}</strong><br><span style="color:#64748b">${p.type}</span><br>${p.address}${p.hours ? `<br><span style="color:#64748b;font-size:11px">${p.hours}</span>` : ""}</div>`).addTo(m); });
    m.on("mouseenter", "places", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "places", () => { m.getCanvas().style.cursor = ""; });
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new MlMap({ container: el.current, style: STYLES.light, center: CENTER, zoom: 14.4, attributionControl: { compact: true }, canvasContextAttributes: { preserveDrawingBuffer: true } });
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    const locate = new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showUserLocation: true, fitBoundsOptions: { maxZoom: 15 } });
    locate.on("geolocate", (e) => locateRef.current?.([+e.coords.longitude.toFixed(6), +e.coords.latitude.toFixed(6)]));
    m.addControl(locate, "bottom-right");
    m.on("error", (e) => console.error("[map]", e.error?.message ?? e));
    m.on("style.load", () => setStyleReady((v) => v + 1));
    m.on("click", (e: MapMouseEvent) => { if (m.getLayer("places") && m.queryRenderedFeatures(e.point, { layers: ["places"] }).length) return; pickRef.current([+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]); });
    (window as unknown as { __map?: MlMap }).__map = m;
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => { const m = map.current; if (m && m.getStyle()?.sprite !== undefined) m.setStyle(STYLES[styleKey]); }, [styleKey]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => { addLayers(m, styleKey); (m.getSource("reach") as GeoJSONSource | undefined)?.setData(reachGeo(reach, "cells")); (m.getSource("reach-lost") as GeoJSONSource | undefined)?.setData(reachGeo(reach, "lost")); };
    if (m.isStyleLoaded()) apply(); else m.once("style.load", apply);
  }, [reach, styleKey, styleReady]);

  // roads the City's sidewalk inventory confirms have no sidewalk; loaded the first time it is asked for
  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => {
      addLayers(m, styleKey);
      m.setLayoutProperty("nosidewalk", "visibility", noSidewalk ? "visible" : "none");
      if (!noSidewalk) return;
      const set = () => (m.getSource("nosidewalk") as GeoJSONSource | undefined)?.setData(noSidewalkData.current ?? empty);
      if (noSidewalkData.current) set();
      else fetch("/data/no-sidewalk.geojson").then((r) => r.json()).then((d: FeatureCollection) => { noSidewalkData.current = d; set(); }).catch(() => {});
    };
    if (m.isStyleLoaded()) apply(); else m.once("style.load", apply);
  }, [noSidewalk, styleKey, styleReady]);

  // draw the chosen route, animating it in from the start point
  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => {
      addLayers(m, styleKey);
      const route = m.getSource("route") as GeoJSONSource | undefined;
      (m.getSource("ghost") as GeoJSONSource | undefined)?.setData(ghostGeo(ghostLegs));
      (m.getSource("waypoints") as GeoJSONSource | undefined)?.setData(waypoints(legs));

      if (anim.current !== null) cancelAnimationFrame(anim.current);
      anim.current = null;
      if (!legs?.length) { route?.setData(empty); return; }
      const full = partial(legs, 1);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce || !route) { route?.setData(full); return; }
      const t0 = performance.now(), dur = 620;
      const step = (t: number) => {
        const raw = Math.min(1, (t - t0) / dur);
        route.setData(raw >= 1 ? full : partial(legs, 1 - Math.pow(1 - raw, 3)));
        anim.current = raw < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);

      badgeMarker.current?.remove(); badgeMarker.current = null;
      const mid = midpoint(legs);
      if (mid && badge) {
        const node = document.createElement("div");
        node.style.cssText = `background:${INK};color:#fff;font:600 12px/1 ui-sans-serif,system-ui;padding:6px 10px;border-radius:999px;box-shadow:0 2px 8px #0000002e;border:2px solid #fff;white-space:nowrap`;
        node.textContent = badge;
        badgeMarker.current = new MlMarker({ element: node }).setLngLat(mid).addTo(m);
        node.setAttribute("aria-hidden", "true"); node.tabIndex = -1;
      }
    };
    if (m.isStyleLoaded()) apply(); else m.once("style.load", apply);
    if (legs?.length) { const b = new LngLatBounds(); for (const l of legs) for (const c of l.coords) b.extend(c); m.fitBounds(b, { padding: { top: 70, bottom: 70, left: 70, right: 70 }, maxZoom: 16.5, duration: 700 }); }
    // a cancelled reveal must never leave a half-drawn line behind
    return () => {
      if (anim.current === null) return;
      cancelAnimationFrame(anim.current); anim.current = null;
      const src = m.getSource("route") as GeoJSONSource | undefined;
      if (src && legs?.length) src.setData(partial(legs, 1));
    };
  }, [legs, ghostLegs, badge, styleKey, styleReady]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => { addLayers(m, styleKey); (m.getSource("places") as GeoJSONSource | undefined)?.setData(placesGeo(places)); };
    if (m.isStyleLoaded()) apply(); else m.once("style.load", apply);
  }, [places, styleKey, styleReady]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.forEach((mk) => mk.remove()); markers.current = [];
    const pin = (lon: number, lat: number, label: string, bg: string, popup?: string, name = label) => {
      const node = document.createElement("div");
      node.style.cssText = `background:${bg};color:#fff;font:600 11px/1 ui-sans-serif,system-ui;padding:6px 9px;border-radius:999px;box-shadow:0 2px 6px #00000033;border:2px solid #fff;white-space:nowrap`;
      node.textContent = label;
      const mk = new MlMarker({ element: node, anchor: "bottom" }).setLngLat([lon, lat]);
      if (popup) mk.setPopup(new Popup({ offset: 14, closeButton: false }).setHTML(`<div style="font:13px/1.45 system-ui;max-width:230px">${popup}</div>`));
      mk.addTo(m); markers.current.push(mk);
      node.setAttribute("aria-label", name);
      node.setAttribute("role", popup ? "button" : "img");
    };
    if (from) pin(from[0], from[1], "Start", "#2f6f4e", undefined, "Start point");
    if (to) pin(to[0], to[1], "End", "#a8331f", undefined, "Destination");
    for (const o of outages) pin(o.lon, o.lat, "Elevator out", "#a8331f", `<strong>${o.station}</strong><br>${o.detail}`, `Elevator out at ${o.station}`);
  }, [from, to, outages]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      {weather && (
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-lg bg-white/92 px-2.5 py-1.5 text-[11.5px] shadow-sm backdrop-blur">
          <span className="tnum font-semibold">{weather.temp ?? "?"}°</span>
          {weather.humidex !== null && <span className="tnum text-[#736d60]">humidex {weather.humidex}</span>}
          {weather.warnings.length > 0 && <span className="ml-0.5 rounded bg-[#fbeee6] px-1.5 py-px text-[10.5px] font-medium text-[#7c2d12]">{weather.warnings[0].text.split(/[-–—]/)[0].trim().toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>}
        </div>
      )}
      <div className="absolute right-2.5 top-2.5 flex overflow-hidden rounded-lg shadow-sm" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)" }}>
        {(Object.keys(STYLES) as StyleKey[]).map((k) => (
          <button key={k} onClick={() => setStyleKey(k)} title={`${k} basemap`} aria-pressed={styleKey === k}
            style={{ padding: "6px 10px", fontSize: 11, fontWeight: 500, textTransform: "capitalize", background: styleKey === k ? INK : "transparent", color: styleKey === k ? "#ffffff" : "#4a463c" }}>
            {k}
          </button>
        ))}
        <button onClick={() => setNoSidewalk((v) => !v)} aria-pressed={noSidewalk} title="Roads the City of Toronto confirms have no sidewalk (1,165 km)"
          style={{ padding: "6px 10px", fontSize: 11, fontWeight: 500, borderLeft: "1px solid #e4e0d7", background: noSidewalk ? "#a8331f" : "transparent", color: noSidewalk ? "#ffffff" : "#4a463c" }}>
          No sidewalk
        </button>
      </div>
    </div>
  );
}
