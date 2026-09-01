#!/usr/bin/env node
// Builds public/data/places.json: summer cool spaces (Toronto Heat Relief Network) and winter Warming Centres, downtown subset.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [S, W, N, E] = [43.630 - 0.01, -79.420 - 0.015, 43.680 + 0.01, -79.355 + 0.015];
const cool = JSON.parse(await readFile(path.join(ROOT, "data/raw/cool-spaces.geojson"), "utf8"));
const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const firstPoint = (g) => { let c = g.coordinates; while (Array.isArray(c[0])) c = c[0]; return c.map(Number); };
const coolOut = cool.features.filter(f => f.geometry?.coordinates).map(f => { const p = f.properties; const [lon, lat] = firstPoint(f.geometry); return { kind: "cool", name: p.locationName, type: p.locationTypeDesc, address: (p.address ?? "").replace(/\s+/g, " ").trim(), phone: p.phone === "None" ? null : p.phone, url: p.url === "None" ? null : p.url, hours: Object.fromEntries(days.map(d => [d, p[`${d}Open`] && p[`${d}Open`] !== "None" ? `${p[`${d}Open`]}–${p[`${d}Close`]}` : null])), lon: +lon.toFixed(6), lat: +lat.toFixed(6) }; }).filter(p => p.lat >= S && p.lat <= N && p.lon >= W && p.lon <= E);
// Warming Centres (City of Toronto, https://www.toronto.ca/community-people/housing-shelter/homeless-help/warming-centres/) — activated at -5 °C forecast or winter weather warning; open 5 p.m., then 24 h. Surge sites at -15 °C.
const warmSites = [
  { name: "Warming Centre – 81 Elizabeth St", address: "81 Elizabeth St, Toronto", surge: false },
  { name: "Warming Centre – 349 George St", address: "349 George St, Toronto", surge: false },
  { name: "Warming Centre – 885 Scarborough Golf Club Rd", address: "885 Scarborough Golf Club Rd, Toronto", surge: false },
  { name: "Warming Centre – 12 Holmes Ave", address: "12 Holmes Ave, North York", surge: false },
  { name: "Warming Centre – 136 Spadina Rd", address: "136 Spadina Rd, Toronto", surge: false },
  { name: "Cecil Community Centre (surge site)", address: "58 Cecil St, Toronto", surge: true },
  { name: "Jimmie Simpson Recreation Centre (surge site)", address: "870 Queen St E, Toronto", surge: true },
];
const warmOut = [];
for (const s of warmSites) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(s.address)}`;
  const r = await fetch(u, { headers: { "user-agent": "toronto-exposure-router/0.1 (hackathon; contact via github)" } });
  const j = await r.json(); const hit = j[0];
  warmOut.push({ kind: "warm", name: s.name, type: s.surge ? "Warming Centre (surge, opens at -15 °C)" : "Warming Centre (opens at -5 °C forecast)", address: s.address, phone: null, url: "https://www.toronto.ca/community-people/housing-shelter/homeless-help/warming-centres/", hours: { rule: "Opens 5 p.m. on activation, then 24 h until deactivated" }, lon: hit ? +(+hit.lon).toFixed(6) : null, lat: hit ? +(+hit.lat).toFixed(6) : null, geocoded: hit?.display_name ?? null });
  await new Promise(res => setTimeout(res, 1100));
}
const out = { meta: { built: new Date().toISOString(), coolSource: "City of Toronto Open Data: Air Conditioned and Cool Spaces (Heat Relief Network), refreshed 2026-08-20", warmSource: "toronto.ca Warming Centres page, fetched 2026-09-01; geocoded with OSM Nominatim" }, cool: coolOut, warm: warmOut };
await writeFile(path.join(ROOT, "public/data/places.json"), JSON.stringify(out));
console.log(`cool spaces downtown: ${coolOut.length} (types: ${[...new Set(coolOut.map(c => c.type))].join(", ")})`);
console.log("warming centres:", warmOut.map(w => `${w.address} → ${w.lat ? w.lat + "," + w.lon : "NOT GEOCODED"}`).join("\n  "));
