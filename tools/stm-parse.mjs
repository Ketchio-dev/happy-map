// Montréal: the STM publishes elevator status as a web page, not a feed. Each alert on
// /en/info/service-updates/elevators is a section with the line icon, the station name,
// a one-line message and a description. Plain JavaScript so the VPS logger (no build step)
// and the Next.js adapter share one parser.
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/\s+/g, " ").trim();
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** FNV-1a over the description: the page has no alert ids, and the same outage must keep one id across polls */
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };

/**
 * @typedef {{ id: string; type: string; code: null; station: string; lat: null; lon: null; header: string; effect: string; severity: string; cause: null; causeDesc: string | null; planned: string; stops: string[]; start: null; targetRemoval: null; updated: string }} StmAlert
 * @param {string} html
 * @param {string} fetched ISO instant of the fetch
 * @returns {StmAlert[]}
 */
export function parseStm(html, fetched) {
  const out = [];
  const re = /<section class="item item-alert-elevator">([\s\S]*?)<\/section>/g;
  let m;
  while ((m = re.exec(html))) {
    const sec = m[1];
    const line = /icon-line-(\d+)/.exec(sec)?.[1] ?? null;
    const title = /<div class="group-title-station-line">([\s\S]*?)<\/div>/.exec(sec)?.[1] ?? "";
    const station = strip(title).replace(/^\d+\s*/, "").trim();
    const message = strip(/<div class="group-title-station-message">([\s\S]*?)<\/div>/.exec(sec)?.[1] ?? "");
    const desc = strip(sec.replace(/<div class="group-title-station">[\s\S]*?<\/div>\s*<\/div>/, ""));
    if (!station) continue;
    out.push({ id: `stm-${slug(station)}-${fnv(desc || message)}`, type: /escalator/i.test(message) ? "Escalator" : "Elevator", code: null, station, lat: null, lon: null, header: `${station}: ${desc || message}`, effect: "Out of service", severity: "", cause: null, causeDesc: /indefinite/i.test(desc) ? "Indefinite period" : null, planned: message, stops: line ? [line] : [], start: null, targetRemoval: null, updated: fetched });
  }
  return out;
}

export const URL_STM = "https://www.stm.info/en/info/service-updates/elevators";
export const STM_HEADERS = { "user-agent": "happy-map/0.1 (GatewayHacks project)", "accept-language": "en" };
