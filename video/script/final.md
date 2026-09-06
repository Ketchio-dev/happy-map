# Final cut: script and shot list

Twelve lines, 231 words. Time the synthesized read before fixing scene durations; at a
narration pace of 130 to 140 words a minute that is about 100 seconds plus holds, so 105 to 115 s. Same
pipeline as the test cut (`video/script/final.json` → `tts/synthesize.py` → `tts/captions.mjs` →
`footage/record.mjs` → Remotion); the ids are the scene ids and the audio file names.

## What this script holds itself to

- Written to be said: short clauses, a breath at every full stop, no parentheses, no number the
  mouth cannot get through in one go.
- It opens on one morning and one station, and the last line returns to that morning.
- Every line points at something on screen within two seconds. The voice never reads the
  caption; the caption never repeats the voice.
- Concrete nouns carry it: Bloor-Yonge, a kilometre, thirty minutes, the RÉSO.
- The shortest sentence lands the key number ("Nineteen minutes becomes thirty.").
- One real limit is said out loud ("These routes are simulated."), not a compliment to itself.
- Every figure is one the repo can show: the Sept 2 08:00 replay (6 elevators, 19 → 30 min),
  the Eaton Centre preset (16 m vs 1.04 km, +1 min), `sidewalks-summary.json`,
  `outage-impact.json` (36 of 149 trips, median +30 min), `eval-montreal-core.json` (−36%).

## Shot list

| id | On screen | Footage mark (record.mjs) |
|---|---|---|
| open | Live tab in replay at `?at=2026-09-02T12:00:00Z`: the banner "Replay · Sep 2, 8:00 am · 6 elevators out", red pins on the five stations (Rosedale has two alerts). Hold. | `replay-sep2` |
| stakes | Route tab, same replay, Union → Bloor-Yonge, step-free card selected: 30 min, "Skips Bloor-Yonge … elevator out · +11 min". Slow push-in on the card. | `Route` after `replay-sep2` |
| hook | Back to live, Eaton Centre preset. The four cards appear as the words land: Indoor first on "cold", Shade first on "sun", the stairs count on "stairs", the Skips line on "elevator". | `loaded`, then card labels word-timed |
| compare | Map only: the chosen route over the grey dashed fastest route, badge "Indoor first · 19 min". | `Indoor first` |
| number | Number card: 16 m vs 1.04 km, +1 min, small footnote "indoor first, walking; has stairs". Static, three seconds. | none (card) |
| shade | Shade first, Union → Toronto General: purple and orange legs; the Sun position slider dragged 8:00 → 14:00; then the Sky row with the live cloud figure and the Live/Clear toggle. | `Shade first`, `Sky` |
| sidewalks | Sidewalk card: 11,441 km flagged → 4,553 has one · 1,165 confirmed none · 5,723 unresolved. Then the "No sidewalk" map layer for one second. | `No sidewalk` |
| replay | Live tab bottom: the staircase sparkline; the slider dragged left; pins come and go on the map. | `Replay drag` |
| impact | Outage timeline scene with the Bloor-Yonge annotation: "36 of 149 trips · median +30 min". | none (card) |
| montreal | City select → Montréal; RÉSO preset; Indoor first selected (one trip: 400 m outdoors, RÉSO badge). The caption carries the median, not the voice. | `montreal`, `RÉSO` |
| honest | Evidence page, section 1, slow scroll to the city-wide row with the zero. | `evidence` |
| close | Outro card: wordmark, URL, repo. Fade to the ground colour. | none (card) |

## Not decided yet

- Voice. The pipeline takes any reference clip: the author's own voice, the neutral synthetic
  voice (option C in `out/voice-comparison.m4a`), or a fresh read of these twelve lines.
- No disclosure line in the outro (decided 2026-09-06).
