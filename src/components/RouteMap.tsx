"use client";
import { useEffect, useRef, useState } from "react";
import { Map as MlMap, Marker as MlMarker, Popup, NavigationControl, LngLatBounds, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Leg } from "@/lib/router";
import type { Place } from "@/lib/types";

export interface OutageMarker { lon: number; lat: number; station: string; detail: string }
export interface MapProps {
  from: [number, number] | null; to: [number, number] | null;
  legs: Leg[] | null; ghostLegs: Leg[] | null;
  badge: string | null;
  outages: OutageMarker[]; places: Place[];
  onPick: (p: [number, number]) => void;
}

const STYLES = { light: "https://tiles.openfreemap.org/styles/positron", detailed: "https://tiles.openfreemap.org/styles/bright" };
const CENTER: [number, number] = [-79.3835, 43.6512];

function legsToGeoJSON(legs: Leg[] | null): FeatureCollection {
  return { type: "FeatureCollection", features: (legs ?? []).map((l) => ({ type: "Feature", properties: { shelter: l.shelter, steps: l.steps, sun: l.sun, name: l.name, link: l.hw === "station_link", ...(l.transit ? { transit: l.transit } : {}) }, geometry: { type: "LineString", coordinates: l.coords } })) };
}
function placesToGeoJSON(places: Place[]): FeatureCollection {
  return { type: "FeatureCollection", features: places.filter((p) => p.lon !== null && p.lat !== null).map((p) => ({ type: "Feature", properties: { kind: p.kind, name: p.name, type: p.type, address: p.address, hours: Object.entries(p.hours).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") }, geometry: { type: "Point", coordinates: [p.lon as number, p.lat as number] } })) };
}
/** point roughly halfway along the route, for the summary badge */
function midpoint(legs: Leg[] | null): [number, number] | null {
  if (!legs?.length) return null;
  const total = legs.reduce((s, l) => s + l.len, 0); let acc = 0;
  for (const l of legs) { if (acc + l.len >= total / 2) return l.coords[Math.floor(l.coords.length / 2)]; acc += l.len; }
  return legs[legs.length - 1].coords[0];
}

export default function RouteMap({ from, to, legs, ghostLegs, badge, outages, places, onPick }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<MlMarker[]>([]);
  const badgeMarker = useRef<MlMarker | null>(null);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const [styleKey, setStyleKey] = useState<keyof typeof STYLES>("light");

  const addLayers = (m: MlMap) => {
    if (m.getSource("route")) return;
    m.addSource("ghost", { type: "geojson", data: legsToGeoJSON(null) });
    m.addLayer({ id: "ghost", type: "line", source: "ghost", paint: { "line-color": "#94a3b8", "line-width": 5, "line-dasharray": [1.4, 1.4], "line-opacity": 0.7 }, layout: { "line-cap": "round", "line-join": "round" } });
    m.addSource("route", { type: "geojson", data: legsToGeoJSON(null) });
    m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } });
    m.addLayer({ id: "route", type: "line", source: "route", filter: ["!", ["has", "transit"]], layout: { "line-cap": "round", "line-join": "round" }, paint: {
      "line-width": 7, "line-color": ["case", ["==", ["get", "shelter"], 2], "#2563eb", ["==", ["get", "shelter"], 1], "#0ea5e9", ["<", ["get", "sun"], 0.35], "#16a34a", "#f97316"] } });
    m.addLayer({ id: "route-transit", type: "line", source: "route", filter: ["has", "transit"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 8, "line-color": ["match", ["get", "transit"], "1", "#f2c31c", "2", "#00923f", "4", "#a21a68", "#64748b"] } });
    m.addLayer({ id: "route-steps", type: "line", source: "route", filter: ["==", ["get", "steps"], true], paint: { "line-color": "#dc2626", "line-width": 3.5, "line-dasharray": [0.5, 1.1] } });
    m.addLayer({ id: "route-arrows", type: "symbol", source: "route", layout: { "symbol-placement": "line", "symbol-spacing": 90, "text-field": "▸", "text-size": 15, "text-allow-overlap": true, "text-keep-upright": false, "text-rotation-alignment": "map" }, paint: { "text-color": "#ffffff", "text-halo-color": "#00000055", "text-halo-width": 0.6 } });
    m.addSource("places", { type: "geojson", data: placesToGeoJSON([]) });
    m.addLayer({ id: "places", type: "circle", source: "places", paint: { "circle-radius": 5.5, "circle-color": ["match", ["get", "kind"], "cool", "#0891b2", "warm", "#ea580c", "#64748b"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.9 } });
    m.on("click", "places", (e) => { const f = e.features?.[0]; if (!f) return; const p = f.properties as Record<string, string>; new Popup({ offset: 10, closeButton: false }).setLngLat(e.lngLat).setHTML(`<div style="font:13px/1.45 system-ui"><strong>${p.name}</strong><br><span style="color:#64748b">${p.type}</span><br>${p.address}${p.hours ? `<br><span style="color:#64748b;font-size:11px">${p.hours}</span>` : ""}</div>`).addTo(m); });
    m.on("mouseenter", "places", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "places", () => { m.getCanvas().style.cursor = ""; });
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new MlMap({ container: el.current, style: STYLES.light, center: CENTER, zoom: 14.4, attributionControl: { compact: true }, canvasContextAttributes: { preserveDrawingBuffer: true } });
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.on("error", (e) => console.error("[map]", e.error?.message ?? e));
    m.on("style.load", () => addLayers(m));
    m.on("click", (e: MapMouseEvent) => { if (m.getLayer("places") && m.queryRenderedFeatures(e.point, { layers: ["places"] }).length) return; pickRef.current([+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]); });
    (window as unknown as { __map?: MlMap }).__map = m;
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => { const m = map.current; if (m) m.setStyle(STYLES[styleKey]); }, [styleKey]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => {
      addLayers(m);
      (m.getSource("route") as GeoJSONSource | undefined)?.setData(legsToGeoJSON(legs));
      (m.getSource("ghost") as GeoJSONSource | undefined)?.setData(legsToGeoJSON(ghostLegs));
      badgeMarker.current?.remove(); badgeMarker.current = null;
      const mid = midpoint(legs);
      if (mid && badge) {
        const node = document.createElement("div");
        node.className = "rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md ring-2 ring-white";
        node.textContent = badge;
        badgeMarker.current = new MlMarker({ element: node }).setLngLat(mid).addTo(m);
      }
    };
    if (m.isStyleLoaded()) apply(); else m.once("style.load", apply);
    if (legs?.length) { const b = new LngLatBounds(); for (const l of legs) for (const c of l.coords) b.extend(c); m.fitBounds(b, { padding: { top: 70, bottom: 70, left: 70, right: 70 }, maxZoom: 16.5, duration: 700 }); }
  }, [legs, ghostLegs, badge, styleKey]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => (m.getSource("places") as GeoJSONSource | undefined)?.setData(placesToGeoJSON(places));
    if (m.isStyleLoaded()) apply(); else m.once("style.load", apply);
  }, [places, styleKey]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.forEach((mk) => mk.remove()); markers.current = [];
    const pin = (lon: number, lat: number, label: string, bg: string, popup?: string) => {
      const node = document.createElement("div");
      node.style.cssText = `background:${bg};color:#fff;font:600 11px/1 system-ui;padding:5px 8px;border-radius:999px;box-shadow:0 1px 4px #0003;border:2px solid #fff;white-space:nowrap`;
      node.textContent = label;
      const mk = new MlMarker({ element: node, anchor: "bottom" }).setLngLat([lon, lat]);
      if (popup) mk.setPopup(new Popup({ offset: 14, closeButton: false }).setHTML(`<div style="font:13px/1.45 system-ui;max-width:230px">${popup}</div>`));
      mk.addTo(m); markers.current.push(mk);
    };
    if (from) pin(from[0], from[1], "Start", "#16a34a");
    if (to) pin(to[0], to[1], "End", "#dc2626");
    for (const o of outages) pin(o.lon, o.lat, "⛔ elevator", "#b91c1c", `<strong>${o.station}</strong><br>${o.detail}`);
  }, [from, to, outages]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      <div className="absolute right-2.5 top-2.5 flex overflow-hidden rounded-lg border border-zinc-300 bg-white text-[11px] font-medium shadow-sm">
        {(Object.keys(STYLES) as (keyof typeof STYLES)[]).map((k) => (
          <button key={k} onClick={() => setStyleKey(k)} className={`px-2.5 py-1.5 capitalize ${styleKey === k ? "bg-blue-600 text-white" : "text-zinc-700 hover:bg-zinc-50"}`}>{k}</button>
        ))}
      </div>
    </div>
  );
}
