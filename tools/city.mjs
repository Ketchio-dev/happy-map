// Where a city's files live. Toronto keeps the original flat layout (data/, data/raw/);
// any other city is nested under its id, so `CITY=montreal node tools/build-graph.mjs` works.
import path from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CITY = process.env.CITY ?? "toronto";
const sub = CITY === "toronto" ? [] : [CITY];
export const RAW = path.join(ROOT, "data", "raw", ...sub);
export const DATA = path.join(ROOT, "data", ...sub);
export const GRAPH_JSON = path.join(DATA, "graph.json");
export const GRAPH_BIN = path.join(DATA, "graph.bin");
export const SUBWAY_JSON = path.join(DATA, "subway.json");
export const GTFS = path.join(RAW, "gtfs");
export const OSM_JSON = path.join(RAW, "osm-downtown.json");
export const OSM_LINES = path.join(RAW, "osm-lines");
// south,west,north,east
export const BBOXES = { toronto: "43.575,-79.640,43.860,-79.115", montreal: "45.430,-73.720,45.600,-73.480" };
export const BBOX = process.env.BBOX ?? BBOXES[CITY] ?? BBOXES.toronto;
