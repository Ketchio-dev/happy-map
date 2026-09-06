/** Everything that differs between cities. The router, the graph format and the evaluation
 *  are city-agnostic; this is the list of what is not. Safe to import on the client. */
export interface Preset { label: string; from: { lon: number; lat: number; label: string }; to: { lon: number; lat: number; label: string } }
export interface CityConfig {
  id: string; name: string; /** transit agency, for labels */ transit: string;
  center: [number, number]; zoom: number;
  presets: Preset[];
  /** line id → colour on the map; hand-tuned so nothing collides with the walking ramp */
  lineColors: Record<string, string>; lineLabels: [string, string][];
  /** the graph carries sun data (buildings + trees) */ hasShade: boolean;
  /** an outage log exists to replay */ hasOutageLog: boolean;
  /** which live elevator feed */ alerts: "ttc" | "stm";
  weather: { lat: number; lon: number; ecccBbox: string; ecccName: string };
  /** lon,lat,lon,lat viewbox that bounds geocoding */ geocodeViewbox: string;
  sheltered: string;
}
const P = (lon: number, lat: number, label: string) => ({ lon, lat, label });

export const CITIES: Record<string, CityConfig> = {
  toronto: {
    id: "toronto", name: "Toronto", transit: "TTC", center: [-79.3835, 43.6512], zoom: 14.4,
    presets: [
      { label: "Eaton Centre", from: P(-79.3791, 43.6435, "Scotiabank Arena"), to: P(-79.3806, 43.6544, "CF Toronto Eaton Centre") },
      { label: "Toronto General", from: P(-79.3806, 43.6453, "Union Station"), to: P(-79.3878, 43.6588, "Toronto General Hospital") },
      { label: "City Hall", from: P(-79.3846, 43.6476, "St Andrew Station"), to: P(-79.3839, 43.6534, "Toronto City Hall") },
      { label: "Bloor-Yonge", from: P(-79.3806, 43.6453, "Union Station"), to: P(-79.3864, 43.6708, "Bloor-Yonge Station") },
      { label: "Etobicoke", from: P(-79.5252, 43.6449, "Kipling Station"), to: P(-79.3806, 43.6453, "Union Station") },
      { label: "Scarborough", from: P(-79.2634, 43.7325, "Kennedy Station"), to: P(-79.3806, 43.6453, "Union Station") },
    ],
    lineColors: { "1": "#e5b611", "2": "#12823f", "4": "#8f2060", "5": "#e8741a", "6": "#6f6a60" },
    lineLabels: [["#e5b611", "Line 1"], ["#12823f", "Line 2"], ["#8f2060", "Line 4"], ["#e8741a", "Line 5"], ["#6f6a60", "Line 6"]],
    hasShade: true, hasOutageLog: true, alerts: "ttc",
    weather: { lat: 43.65, lon: -79.38, ecccBbox: "-79.45,43.60,-79.30,43.80", ecccName: "toronto" },
    geocodeViewbox: "-79.425,43.685,-79.350,43.628", sheltered: "PATH",
  },
  montreal: {
    id: "montreal", name: "Montréal", transit: "STM", center: [-73.5673, 45.5035], zoom: 14.4,
    presets: [
      { label: "RÉSO", from: P(-73.5668, 45.4996, "Gare Centrale"), to: P(-73.5637, 45.5078, "Complexe Desjardins") },
      { label: "Old Port", from: P(-73.5628, 45.5017, "Square-Victoria–OACI"), to: P(-73.5518, 45.5078, "Marché Bonsecours") },
      { label: "CHUM", from: P(-73.5747, 45.5009, "Peel Station"), to: P(-73.5573, 45.5115, "CHUM") },
      { label: "Plateau", from: P(-73.5817, 45.5245, "Mont-Royal Station"), to: P(-73.5665, 45.5075, "Place des Arts") },
      { label: "Longueuil", from: P(-73.5218, 45.5245, "Longueuil–Université-de-Sherbrooke"), to: P(-73.5668, 45.4996, "Gare Centrale") },
    ],
    lineColors: { "1": "#1fa83a", "2": "#ef7d1a", "4": "#e6c000", "5": "#1a86d0" },
    lineLabels: [["#1fa83a", "Green"], ["#ef7d1a", "Orange"], ["#e6c000", "Yellow"], ["#1a86d0", "Blue"]],
    hasShade: false, hasOutageLog: true, alerts: "stm",
    weather: { lat: 45.50, lon: -73.57, ecccBbox: "-73.75,45.40,-73.45,45.70", ecccName: "montr" },
    geocodeViewbox: "-73.62,45.54,-73.53,45.48", sheltered: "RÉSO",
  },
};
export const cityOf = (id?: string | null): CityConfig => CITIES[(id ?? "").toLowerCase()] ?? CITIES.toronto;
