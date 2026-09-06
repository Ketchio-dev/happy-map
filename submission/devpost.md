<!--
Devpost submission text for happy map (GatewayHacks 2026, Accessibility & Health track).
Paste each section into the matching Devpost field. Images to upload, in order:
research/screens/demo.gif (cover), indoor-scotiabank-eaton.png, stepfree-union-bloor.png,
live-tab.png, evidence.png, and a Montréal screenshot.

What this text is optimised for, since judges read fifty of these in an afternoon:
- The first paragraph is one morning, one station, one measured consequence.
- Every number carries its method (150 simulated trips, medians) and the null result stays in.
- Present tense for what exists and runs; future tense only under "What's next".
- Plain words. Nothing is seamless, revolutionary or leveraged.
- It ends with four links a judge can open in sixty seconds.
Reviewed once with codex exec (2026-09-06); its factual corrections are in, its flattening is not.
-->

# happy map

**Tagline (Devpost field, max 200 characters):**
Walking and subway routes costed by what you are exposed to: minutes outdoors, direct sun, stairs, and the elevator that is out right now. Toronto and Montréal, on open data.

---

## Inspiration

At eight in the morning on September 2, six TTC elevators were out of service, one of them at Bloor-Yonge. A route planner that counts only minutes does not notice. In my simulation, the step-free trip from Union to Bloor-Yonge went from 19 minutes to 30 that morning, because the route could no longer use Bloor-Yonge and had to go around.

I live in Toronto. Every winter I watch people take the PATH not because it is faster but because it is indoors, and every summer I watch people cross the street to walk on the shaded side. A planner that counts only minutes sees none of this. happy map counts the rest.

## What it does

You pick a start and a destination. happy map returns four routes side by side (three in Montréal, which has no shade data yet) and prints what each one costs.

- **Fastest.** The plain shortest route, always shown, so the trade-off is never hidden.
- **Indoor first.** Fewer minutes outdoors, for a little more time. Prefers the PATH tunnels, covered walkways and the subway.
- **Shade first.** Fewer metres in direct sun at the hour you choose. Sun is modelled from 3D building footprints and the City's measured street trees, and eased off when the sky is overcast right now.
- **Step-free.** No mapped stairs or raised kerbs, and no station whose elevator the TTC reports out of service right now. It blocks the whole station while any of its elevators is out, which is cautious and overstates some outages. The card prints what the outage costs against the same trip with every elevator working.

Every route is also charged for walking on a road with no sidewalk, on loose ground, or up a steep grade: the places that turn dangerous once there is snow on them.

Two more views turn the question around. **Reach** shades every 90-metre cell you can get to within a time budget and an outdoor cap, and marks in red what an elevator outage took away. **Replay** scrubs through the outage log since September 1: pick a moment, and every route is costed with the elevators recorded out at that moment. The streets and the weather stay today's.

Under each route is a step list a screen reader can speak: walk along Front Street indoors, enter Union Station, ride Line 1 to Bloor-Yonge, take the elevator.

## How I built it

The router is an A* search over 492,000 pedestrian edges from OpenStreetMap, costed by an exposure function instead of time. Each edge knows what it is: indoor, covered or open; stairs, elevator or level; sidewalk or no sidewalk; loose or paved; flat or steep; and, for open edges, the fraction of direct sun in twelve day-and-hour buckets. That fraction comes from casting a ray from each segment toward the sun (NOAA solar position) through the City of Toronto's 3D Massing model, plus a canopy for each of 685,000 street trees sized from its trunk diameter.

Subway and light-rail stations come from TTC GTFS (Lines 1, 2, 4, 5 and 6) and are linked to the mapped entrances. The TTC's accessibility feed has been logged every five minutes since the evening of September 1, first from GitHub Actions and a laptop, since September 5 from a small server that keeps going whether or not my laptop is open. The Live tab reads the feed directly; the log drives the Replay scrubber and the evidence page.

The graph is packed into a 31 MB binary of typed arrays and loads in about 200 ms on a laptop. Next.js, TypeScript and MapLibre, deployed on Vercel. 103 tests run on every push to main, most of them against the real graph: every cost multiplier is at least one, which is what keeps the A* heuristic admissible; the A* answer equals plain Dijkstra on random pairs; a blocked station never appears on a step-free path; every station name the feed has used resolves to a graph station, with one documented exception.

## Challenges

**Missing tags were being read as missing sidewalks.** OpenStreetMap had no sidewalk mapped on 11,441 km of the 24,225 km network. I checked each of those segments against the City's Pedestrian Network inventory: 4,553 km has a sidewalk after all, 1,165 km is confirmed to have none, and 5,723 km is outside the inventory and stays penalised. The map layer that shows the confirmed 1,165 km is one click away.

**I found no plowing data.** PlowTO is a seasonal map with no API, and the open data portal has no plowing dataset. So the winter signal is structural rather than live: a missing, loose or steep sidewalk is where the snow will hurt.

**The elevator feed does not speak GTFS.** Its stop ids belong to a different id space, so stations are matched by name. One normaliser is shared by every code path, and a test fails the build if a name the feed has used stops resolving.

**Not tested with users yet.** I am one person, and a hackathon is not the setting in which to ask disabled riders to evaluate my prototype. So the evidence is simulated: 150 random trips per mode and per city, compared against the fastest route, with the null results kept in. The next step is to sit with wheelchair users and check station entrances and the text itinerary against what they know.

## Accomplishments

Unless noted, figures are medians over 150 random trips per mode, compared against the fastest route. The outage study uses the 149 of those trips that had a step-free route and compares each against itself with the station open. The tables are in `research/` in the repo and on the evidence page.

- Downtown Toronto, indoor first: outdoor distance down 32% (898 m to 608 m), for 7.6% more time. 74% of trips cut outdoor distance by more than 5%.
- Downtown Toronto, shade first, modelled for July 15 at 2 pm under a clear sky: distance in direct sun down 47%.
- Across the whole city, indoor first: the median gain is zero. 31% of trips still improve, but sheltered walking barely exists outside the financial district, and the app shows that rather than hiding it.
- 36 of 149 simulated step-free trips passed through Bloor-Yonge. Blocking it made 33 of them more than a minute longer, and the median added time across the 36 was 30 minutes. Each kept a route on paper; whether a person can walk the detour is a different question, and 8 of the 150 downtown trips had no step-free route at all.
- Montréal, pointed at the same pipeline in an afternoon: downtown outdoor distance down 36% through the RÉSO, for 5.3% more time. The GTFS marks 25 of its 68 métro stations as accessible, against 62 of 71 in Toronto. On the Longueuil preset, a 21-minute métro trip becomes nearly two hours step-free, most of it walking over the Jacques-Cartier bridge, because Longueuil station has no elevator.
- Zero axe-core violations against WCAG 2.1 AA on every tab on desktop and the route view on a phone, with a live region that announces the selected route and a text itinerary. Screen-reader use has not yet been tested with people.

## What I learned

The gap between the two evaluations is the finding. Indoor routing removes a third of the outdoor walking where an indoor network exists and almost none where it does not, and no algorithm changes that. Showing the null result next to the good one made the project more convincing, not less.

I also learned to distrust my own map. Much of what looked like missing sidewalks was missing data, and the correction was an inventory the City had published all along.

## What's next

- Snow and ice conditions the day a Canadian city publishes them.
- Building heights for Montréal, so shade routing works there too.
- The elevator log for every agency that publishes one. Montréal's started on September 6; New York and London publish feeds.
- Sessions with wheelchair users, so the next numbers are theirs and not the simulation's.

## Try it in sixty seconds

1. [Scotiabank Arena to the Eaton Centre, indoor first](https://happy-map-ashy.vercel.app/?from=-79.37910,43.64350,Scotiabank%20Arena&to=-79.38060,43.65440,CF%20Toronto%20Eaton%20Centre&mode=indoor&hour=d0715_h14): 16 metres outdoors instead of a kilometre, for one extra minute. This one has stairs; the step-free card beside it does not.
2. [Union to Bloor-Yonge, step-free, on the morning its elevator was out](https://happy-map-ashy.vercel.app/?at=2026-09-02T12:00:00Z&mode=stepfree&walk=0&from=-79.38060,43.64530,Union%20Station&to=-79.38640,43.67080,Bloor-Yonge%20Station): 19 minutes becomes 30, and the card says why.
3. [Montréal](https://happy-map-ashy.vercel.app/?city=montreal): the same router on the RÉSO.
4. [Evidence](https://happy-map-ashy.vercel.app/evidence): every number above, with its method and its limits.

Source: https://github.com/Ketchio-dev/happy-map · Live: https://happy-map-ashy.vercel.app

---

**Built with (Devpost tags):** typescript, next.js, react, maplibre-gl, vercel, openstreetmap, overpass-api, gtfs, vitest, playwright, axe-core, remotion, node.js

**Data:** OpenStreetMap contributors (ODbL); City of Toronto Open Data: 3D Massing, Street Tree Data, Pedestrian Network, Heat Relief Network, TTC Routes and Schedules; TTC live service alerts; STM GTFS and elevator status; Environment and Climate Change Canada; Open-Meteo; OpenFreeMap tiles.
