# Working notes for agents

Next.js 16 (App Router) + TypeScript + Tailwind 4 + MapLibre 5. pnpm. Dev: `pnpm dev`.

## Layout
- `src/app/page.tsx` — map UI: icon rail, route panel with strategy cards, live tab, about tab.
- `src/app/evidence/page.tsx` — evidence dashboard, reads `research/*.json` at request time.
- `src/lib/graph.ts` — loads `data/graph.bin` + `data/subway.json`, builds adjacency + spatial index + connected-component sizes, appends subway nodes/edges.
- `src/lib/router.ts` — exposure-weighted A*. `edgeCost()` holds the cost model; the heuristic assumes no penalties, so it stays admissible as long as every multiplier is >= 1.
- `src/app/api/routes` — all four strategies in one call (used by the UI). `api/route` — single strategy (used by `tools/evaluate.mjs`).
- `tools/*.mjs` — data pipeline and evaluation, see README.

## Rules
- **maplibre-gl must stay on 5.x.** 6.x never fires `load` under Next/Turbopack.
- MapLibre `["has", "x"]` is true for null-valued properties. Omit the key instead of setting null.
- `suncalc` npm package is broken (no default export, wrong values). Use `tools/solar.mjs`.
- Keep the `/api/route` request/response shape stable or `tools/evaluate.mjs` breaks.
- `data/graph.json` is an intermediate; the app reads `data/graph.bin`. Always run `node tools/pack-graph.mjs` after rebuilding the graph or the shade data, or the app keeps serving the old graph.
- Sections in `graph.bin` are 8-byte aligned. If you add one, keep the padding or the typed-array views throw.
- Rerun `node tools/evaluate.mjs` (twice, LABEL=core and LABEL=wide) after any change to `edgeCost()`, and update the numbers in README, the About tab and the evidence page.
- Screenshots: `CHROME_BIN=<cached playwright chromium binary> node tools/screenshot.mjs` with the dev server running.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
