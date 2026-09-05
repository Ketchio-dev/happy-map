# happy map — exposure-aware routing across Toronto

**Live: https://happy-map-ashy.vercel.app**

Walking and subway routes across Toronto costed by what you are exposed to rather than time alone: minutes outdoors, metres in direct sun, stairs, blocks with no sidewalk, and TTC stations whose elevator is out at this moment.

Built solo for [GatewayHacks 2026](https://gatewayhacks-2026.devpost.com/) (Accessibility & Health track).

## What it does

One router, three cost layers, switched automatically by Environment Canada warnings:

| Mode | What it optimizes | Data |
|---|---|---|
| Indoor first | minimise time outdoors; prefers PATH, tunnels, covered walkways, the subway | OpenStreetMap `tunnel` / `indoor` / `covered` / `corridor` tags, 95 km of sheltered walking |
| Shade first | minimise time in direct sun at the chosen hour; shows Heat Relief Network cool spaces | Toronto 3D Massing (building heights) + NOAA solar position → per-segment sun fraction for 12 day/hour buckets |
| Step-free | no stairs, no raised kerbs, no station whose elevator is out **right now** | OSM `highway=steps`, `wheelchair`, `barrier=kerb`; TTC live alerts feed |

Every route is also charged for walking on a road with no mapped sidewalk (47 % of the network), for loose or unpaved ground, and for steep grades — the conditions that turn dangerous once there is snow on them.

Every result is shown next to the plain fastest route, so the trade-off is explicit: *"16 m outdoors, 98 % less than fastest, one minute longer"*.

## Evidence (no human testers; all numbers are computed)

`tools/evaluate.mjs` routes 150 random trips in each mode and compares against the fastest route. It is run twice: once inside the PATH-dense financial district, once across the whole covered area (`research/eval-core.json`, `research/eval-wide.json`):

| Run | Median change vs fastest route | Trips improved | Median extra time |
|---|---|---|---|
| Indoor first, downtown core | outdoor distance −33 % (1,241 m → 831 m) | 77 % | +6.2 % |
| Shade first, July 15 14:00 | direct-sun distance −48 % | 46 % | +6.0 % |
| Indoor first, city-wide | no measurable gain | 33 % | — |
| Step-free | 8 of 150 trips have **no** step-free route at all | — | — |

A five-minute timer on a small VPS has been logging every TTC elevator and escalator alert since 2026-09-01 (GitHub Actions and a laptop poller before 2026-09-05); `tools/analyze-outages.mjs` summarizes outage counts, durations and stations (`research/outages-summary.json`).

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

`tools/vps/` holds the systemd timer that records the TTC accessibility feed every
5 minutes and commits each change, so the outage history keeps growing whether or
not a laptop is awake. `tools/vps/install.sh` sets it up on an Ubuntu host with a
write-enabled deploy key; `.github/workflows/log-ttc-alerts.yml` is a manual fallback.

Data files (`data/graph.json`, `data/subway.json`, `public/data/places.json`) are committed. To rebuild from sources:

```bash
node tools/fetch-osm.mjs        # OpenStreetMap via Overpass → data/raw/osm-downtown.json
node tools/build-graph.mjs      # → data/graph.json
node tools/compute-shade.mjs    # needs data/raw/massing/ (Toronto 3D Massing 2025 shapefile) → adds edge.sun
node tools/build-subway.mjs     # needs data/raw/gtfs/ (TTC GTFS) → data/subway.json
node tools/build-places.mjs     # needs data/raw/cool-spaces.geojson → public/data/places.json
node tools/pack-graph.mjs       # data/graph.json → data/graph.bin, what the app actually loads
node tools/log-once.mjs         # one snapshot of the TTC feed → data/ttc-alerts/ (the VPS timer runs this)
node tools/evaluate.mjs         # needs the dev server running
```

## Demo video

`video/` is a Remotion project that renders the pitch video from the same evidence files the site reads: narration lines in `video/script/`, word-timed captions from whisper.cpp, footage recorded from the live app with Playwright, and an outage timeline drawn straight from `research/outages-summary.json`. The narration is synthesized locally from a short recording of the author's own voice. See `AGENTS.md` for the pipeline.

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

## Taking it to another city

Nothing in the method is Toronto-specific; the data is. Each cost layer needs one input, and most large cities publish it:

| Layer | What it needs | Toronto | Elsewhere |
|---|---|---|---|
| Walking network, PATH, stairs, kerbs, sidewalks | OpenStreetMap | Overpass | Overpass, worldwide |
| Subway network and station positions | GTFS | TTC | Standard for nearly every transit agency |
| Live elevator outages | Agency alerts feed | alerts.ttc.ca | e.g. New York MTA, London TfL, Montréal STM publish elevator status APIs |
| Shade | Building footprints with heights | 3D Massing | Most large cities publish footprints; heights or LiDAR often too |
| Cool spaces, warming centres | City open data | Heat Relief Network | Varies by city |
| Automatic mode switch | National weather warnings | Environment Canada | National weather services |

Where a layer is missing the router still runs; that cost simply stays neutral. The evaluation (`tools/evaluate.mjs`) and the outage logger are city-agnostic already. Turning the bounding box, GTFS source and alerts adapter into a single per-city config is the remaining step, and it is on the list.

## Limits

Covers the City of Toronto plus margins into Mississauga, Vaughan and Markham: 346k nodes, 492k edges, 24,225 km of walkable network. Shade is geometric (buildings only, no trees) for twelve representative day/hour buckets, not live cloud cover. Snow clearing is not modelled: PlowTO is a seasonal map with no public API, and Toronto's open data has no plowing dataset, so the winter signal here is structural — where sidewalks are missing, loose, or steep — rather than live. Elevator outages are matched to stations by name from the TTC feed; Line 5 stations are not in the routing graph.
