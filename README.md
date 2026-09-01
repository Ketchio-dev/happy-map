# happy-map — exposure-aware routing for downtown Toronto

**Live: https://happy-map-ashy.vercel.app**

Walking + subway routes that avoid what actually stops vulnerable people: **cold**, **direct sun**, **stairs**, and **out-of-service TTC elevators** — computed from live and open data, for downtown Toronto.

Built solo for [GatewayHacks 2026](https://gatewayhacks-2026.devpost.com/) (Accessibility & Health track).

## What it does

One router, three cost layers, switched automatically by Environment Canada warnings:

| Mode | What it optimizes | Data |
|---|---|---|
| ❄️ Cold | minimize time outdoors; prefers PATH, tunnels, covered walkways, the subway | OpenStreetMap `tunnel` / `indoor` / `covered` / `corridor` tags (38.8 km indoor/underground downtown) |
| ☀️ Heat | minimize time in direct sun at the chosen hour; shows Heat Relief Network cool spaces | Toronto 3D Massing (building heights) + NOAA solar position → per-segment sun fraction for 12 day/hour buckets |
| ♿ Step-free | no stairs, no raised kerbs, no stations whose elevator is out **right now** | OSM `highway=steps`, `wheelchair`, `barrier=kerb`; TTC live alerts feed (polled every 60 s) |

Every result is shown next to the plain fastest route, so the trade-off is explicit: *"outdoors −27 %, time +4 %"*.

## Evidence (no human testers; all numbers are computed)

`tools/evaluate.mjs` routes 120 random downtown trips (0.5–2.5 km) in each mode and compares against the fastest route. 2026-09-01 run (`research/eval-2026-09-01.json`):

| Mode | Median change vs fastest route | Trips improved | Median extra time |
|---|---|---|---|
| Cold | outdoor distance −27 % (948 m → 638 m) | 69 % | +4.4 % |
| Heat, July 15 14:00 | direct-sun distance −50 % | 47 % | +4.6 % |
| Heat, Sept 15 12:00 | direct-sun distance −55 % | 34 % | +5.1 % |
| Step-free | 5 of 120 trips have **no** step-free route at all | — | — |

`tools/poll-ttc-alerts.mjs` has been logging every TTC elevator/escalator alert since 2026-09-01; `tools/analyze-outages.mjs` summarizes outage counts, durations and stations (`research/outages-summary.json`).

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

The scheduled workflow in `.github/workflows/log-ttc-alerts.yml` records the TTC
accessibility feed every 5 minutes, so the outage history keeps growing whether
or not a laptop is awake.

Data files (`data/graph.json`, `data/subway.json`, `public/data/places.json`) are committed. To rebuild from sources:

```bash
node tools/fetch-osm.mjs        # OpenStreetMap via Overpass → data/raw/osm-downtown.json
node tools/build-graph.mjs      # → data/graph.json
node tools/compute-shade.mjs    # needs data/raw/massing/ (Toronto 3D Massing 2025 shapefile) → adds edge.sun
node tools/build-subway.mjs     # needs data/raw/gtfs/ (TTC GTFS) → data/subway.json
node tools/build-places.mjs     # needs data/raw/cool-spaces.geojson → public/data/places.json
node tools/poll-ttc-alerts.mjs  # keep running: logs to data/ttc-alerts/
node tools/evaluate.mjs         # needs the dev server running
```

## API

`POST /api/route` `{ from: [lon, lat], to: [lon, lat], mode: { cold?, heat?, mobility? }, hourBucket?: "d0715_h14", blockedStations?: ["Bloor-Yonge"] }` → chosen route + fastest baseline, each with legs and stats (`outdoor_m`, `sun_m`, `steps_edges`, `transit_s`, …).

`GET /api/alerts` — TTC elevator/escalator outages with station coordinates. `GET /api/weather` — Environment Canada current conditions + warnings + suggested mode.

## Data sources

- OpenStreetMap contributors (ODbL) via Overpass API — pedestrian network, PATH, entrances, elevators
- City of Toronto Open Data: 3D Massing (2025), Air Conditioned and Cool Spaces (Heat Relief Network), TTC Routes and Schedules (GTFS)
- TTC live service alerts (alerts.ttc.ca)
- Environment and Climate Change Canada GeoMet OGC API (city page weather, warnings)
- City of Toronto Warming Centres page (addresses; geocoded with OSM Nominatim)
- Map tiles: OpenFreeMap / OpenMapTiles

## Limits

Downtown only (roughly Bathurst–Parliament, Lake–Bloor). Shade is geometric (buildings only, no trees) for representative hours, not live cloud cover. Sidewalk snow clearing is not modelled yet. Elevator outages are matched to stations by name from the TTC feed; Line 5 stations are not in the routing graph.
