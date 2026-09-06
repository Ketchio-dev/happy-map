# Working notes for agents

Next.js 16 (App Router) + TypeScript + Tailwind 4 + MapLibre 5. pnpm. Dev: `pnpm dev`.

## Layout
- `src/app/page.tsx` — map UI: icon rail, route panel with strategy cards, live tab, about tab.
- `src/app/evidence/page.tsx` — evidence dashboard, reads `research/*.json` at request time.
- `src/lib/graph.ts` — loads `data/graph.bin` + `data/subway.json`, builds adjacency + spatial index + connected-component sizes, appends subway nodes/edges.
- `src/lib/router.ts` — exposure-weighted A*. `edgeCost()` holds the cost model; the heuristic assumes no penalties, so it stays admissible as long as every multiplier is >= 1 and the walking heuristic speed is at least `paceOf(mode)`. Crossing nodes add seconds (signals 8; unmarked 60 step-free / 30 winter).
- `src/lib/reach.ts` — budgeted Dijkstra for the Reach tab: labels are (node, outdoor minutes), dominance-pruned; `best` must stay Float64 (a Float32 round-off once made every label look stale). `api/reach` returns 90 m grid cells.
- `src/lib/cities.ts` — what differs per city (centre, presets, line colours, which feeds exist, geocode viewbox); safe on the client. `cityOf(id)` falls back to Toronto. `loadGraph(city)` reads `data/` for Toronto and `data/<city>/` otherwise, one cached graph per city; every API takes `city` (body or query). The map page reads `?city=` once and reloads to switch.
- `src/lib/adapters/stm.ts` — Montréal's elevator status, scraped from the STM page (there is no feed); `tests/fixtures/` has a captured copy. `api/alerts?city=montreal` uses it; `api/outages` is Toronto-only (the log).
- `tools/city.mjs` — `CITY=montreal` puts raw data under `data/raw/montreal/` and outputs under `data/montreal/`; Toronto keeps the flat layout. build-graph, pack-graph, build-subway, fetch-osm, fetch-osm-lines and evaluate all read it. Montréal has no shade, pednet or crossings step: the graph packs with zero sun buckets and the routes API drops the shade strategy when `hasShade` is false.
- `src/lib/itinerary.ts` — legs → step list (client side).
- `src/lib/stations.ts` — one `normName` for feed names and GTFS names, plus the alias table (Bloor-Yonge → Bloor + Yonge). `graph.ts` and `lib/alerts.ts` both use it; the feed's stop ids are not GTFS ids, so matching is by name only.
- `src/lib/sky.ts` — cloud cover → sky factor (Kasten–Czeplak). `Mode.sky` scales the shade penalty; `api/weather` fetches cloud cover from Open-Meteo alongside ECCC.
- `src/lib/outages.ts` + `api/outages` — replay of the log from `research/outages-summary.json` (live from GitHub raw, local fallback): `activeAt`, `timeline`, `busiest`. `?at=` on the map page swaps the live feed for that instant; whole-second instants are treated as the end of that second.
- `api/routes` — when stations are blocked it also plans the step-free trip unblocked and returns `withoutOutages`, which the card prints as "+N min".
- `src/app/manifest.ts`, `src/app/icon.svg`, `public/icons/` — installable; there is no service worker on purpose (routing is server-side).
- `tests/` — vitest (`pnpm test`); `vitest.config.ts` aliases `server-only` to a stub so `lib/graph.ts` loads in Node. The suite loads the real `data/graph.bin` and checks the router's invariants against it. `tests/stations.test.ts` has a `KNOWN_MISSING` list for feed names the graph cannot place; add there only with a reason.
- `tools/a11y-audit.mjs` — axe-core over every view plus a keyboard walk; keep it at 0 violations. `--color-muted` is #736d60 for AA contrast.
- `src/app/api/routes` — all four strategies in one call (used by the UI). `api/route` — single strategy (used by `tools/evaluate.mjs`).
- `tools/build-subway.mjs` — GTFS route_type 1 plus route_type 0 routes named "Line N" (5 and 6). Lines the GTFS lists but does not schedule fall back to the OSM route relation in `data/raw/osm-lines/` (`tools/fetch-osm-lines.mjs`) with estimated times; `FORCE_OSM_LINES=5,6` exercises that path.
- `tools/*.mjs` — data pipeline and evaluation, see README. Order: fetch-osm → build-graph → compute-shade (buildings + street-tree canopies when data/raw/trees/ exists; ~4 min, run with `--max-old-space-size=12288`) → **apply-pednet** (City sidewalk inventory corrects the roadway flag; needs data/raw/pednet/) → fetch-crossings + apply-crossings (nodeAttr.crossing by coordinate match) → build-subway → build-places → pack-graph → export-no-sidewalk → evaluate (LABEL=core and LABEL=wide) → outage-impact. Post-processors (pednet, crossings) only touch flags/nodeAttr, so they survive a compute-shade rerun; a build-graph rerun resets everything.
- `tools/vps/` — the outage logger as deployed: a systemd timer on the user's OCI VPS (`ubuntu@oci-ubuntu-129-153-49-224` over Tailscale SSH, repo at `~/apps/happy-map`) runs `log-once.mjs` every 5 min and pushes with a deploy key. It is the only writer of `data/ttc-alerts/*.jsonl`; do not re-enable the Actions schedule.

## Rules
- **maplibre-gl must stay on 5.x.** 6.x never fires `load` under Next/Turbopack.
- MapLibre `["has", "x"]` is true for null-valued properties. Omit the key instead of setting null.
- `suncalc` npm package is broken (no default export, wrong values). Use `tools/solar.mjs`.
- Keep the `/api/route` request/response shape stable or `tools/evaluate.mjs` breaks.
- `data/graph.json` is an intermediate (untracked, 48 MB); the app reads `data/graph.bin`. If it is missing, rebuild it (build-graph → compute-shade → apply-pednet → apply-crossings) before packing. Always run `node tools/pack-graph.mjs` after rebuilding the graph or the shade data, or the app keeps serving the old graph.
- Sections in `graph.bin` are 8-byte aligned. If you add one, keep the padding or the typed-array views throw.
- `pnpm test`, `pnpm typecheck` and `pnpm lint` must pass: CI runs them on every push (`.github/workflows/ci.yml`). The eslint `react-hooks/set-state-in-effect` rule is an error: derive state instead of setting it synchronously in an effect (see `busy` in `page.tsx`).
- Rerun `node tools/evaluate.mjs` (twice: `LABEL=core CORE=43.64,-79.395,43.668,-79.37` and `LABEL=wide CORE=43.6,-79.56,43.8,-79.2`, N=150) after any change to `edgeCost()` or the graph, then `node tools/outage-impact.mjs`, and update the numbers in README, the About tab and the evidence page. Edge flag bit 8 means the City inventory was consulted for that edge.
- `/evidence` fetches `research/outages-summary.json` from GitHub raw (10-min revalidate) because the VPS logger recommits it on every feed change; the other research files are read from the deploy.
- The map page initialises from search params (`from`, `to`, `mode`, `hour`, `walk`, `pace`, `tab`, `at`, `sky=clear`) and mirrors state back with `history.replaceState`; the root layout is `force-dynamic` so SSR sees them.
- Screenshots: `CHROME_BIN=<cached playwright chromium binary> node tools/screenshot.mjs` with the dev server running.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Demo video (`video/`)
Standalone Remotion workspace (own `pnpm-workspace.yaml`, excluded from Vercel via `.vercelignore`). Pipeline, in order, all run from inside `video/` unless noted:
1. `script/<name>.json` — narration lines `{id, text}`; one line = one audio file = one scene.
2. `tts/.venv/bin/python tts/synthesize.py script/<name>.json` — Fish Audio S2 Pro via mlx-audio, zero-shot from `~/.happy-map/voice-reference.wav` + `.txt` (the author's own voice; never commit it). Writes `public/audio/<name>/` and `src/generated/<name>.narration.json`.
3. `node tts/captions.mjs <name>` — whisper-cli word timings → `src/generated/<name>.captions.json`. Needs `-ml 1 -sow`, or every line collapses to one caption token.
4. `node video/footage/record.mjs <name>` (from the repo root) — Playwright + **headed** system Chrome at 1280x720 CSS px, 1.5x scale. Headless screencasts drop MapLibre's base map under every GL flag tried; `page.screenshot` is fine, the screencast is not. Writes `src/generated/<name>.footage.json` with the time and position of every click; scenes start relative to those marks (`markAt(label)`) and the cursor overlay is drawn from them, so re-recording never needs hand-tuned offsets.
5. `pnpm exec remotion render src/index.ts Test out/<file>.mp4`; `pnpm studio` to scrub in the browser.
The timeline scene imports `research/outages-summary.json` directly, so rerun `tools/analyze-outages.mjs` before a final render. Pin `zod` to the version Remotion asks for.
