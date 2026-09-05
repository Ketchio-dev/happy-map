# Working notes for agents

Next.js 16 (App Router) + TypeScript + Tailwind 4 + MapLibre 5. pnpm. Dev: `pnpm dev`.

## Layout
- `src/app/page.tsx` — map UI: icon rail, route panel with strategy cards, live tab, about tab.
- `src/app/evidence/page.tsx` — evidence dashboard, reads `research/*.json` at request time.
- `src/lib/graph.ts` — loads `data/graph.bin` + `data/subway.json`, builds adjacency + spatial index + connected-component sizes, appends subway nodes/edges.
- `src/lib/router.ts` — exposure-weighted A*. `edgeCost()` holds the cost model; the heuristic assumes no penalties, so it stays admissible as long as every multiplier is >= 1.
- `src/app/api/routes` — all four strategies in one call (used by the UI). `api/route` — single strategy (used by `tools/evaluate.mjs`).
- `tools/*.mjs` — data pipeline and evaluation, see README.
- `tools/vps/` — the outage logger as deployed: a systemd timer on the user's OCI VPS (`ubuntu@oci-ubuntu-129-153-49-224` over Tailscale SSH, repo at `~/apps/happy-map`) runs `log-once.mjs` every 5 min and pushes with a deploy key. It is the only writer of `data/ttc-alerts/*.jsonl`; do not re-enable the Actions schedule.

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

## Demo video (`video/`)
Standalone Remotion workspace (own `pnpm-workspace.yaml`, excluded from Vercel via `.vercelignore`). Pipeline, in order, all run from inside `video/` unless noted:
1. `script/<name>.json` — narration lines `{id, text}`; one line = one audio file = one scene.
2. `tts/.venv/bin/python tts/synthesize.py script/<name>.json` — Fish Audio S2 Pro via mlx-audio, zero-shot from `~/.happy-map/voice-reference.wav` + `.txt` (the author's own voice; never commit it). Writes `public/audio/<name>/` and `src/generated/<name>.narration.json`.
3. `node tts/captions.mjs <name>` — whisper-cli word timings → `src/generated/<name>.captions.json`. Needs `-ml 1 -sow`, or every line collapses to one caption token.
4. `node video/footage/record.mjs <name>` (from the repo root) — Playwright + **headed** system Chrome. Headless screencasts drop MapLibre's base map under every GL flag tried; `page.screenshot` is fine, the screencast is not. Prints the second each click happened; copy those into `FOOTAGE` in `src/Test.tsx`.
5. `pnpm exec remotion render src/index.ts Test out/<file>.mp4`; `pnpm studio` to scrub in the browser.
The timeline scene imports `research/outages-summary.json` directly, so rerun `tools/analyze-outages.mjs` before a final render. Pin `zod` to the version Remotion asks for.
