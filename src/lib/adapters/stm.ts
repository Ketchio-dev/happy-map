import type { AccessibilityAlert } from "../alerts";

/** Montréal: the STM publishes elevator status as a web page, not a feed. Each alert on
 *  /en/info/service-updates/elevators is a section with the line icon, the station name,
 *  a one-line message and a description. Escalators are shown per station, not as alerts. */
const URL_STM = "https://www.stm.info/en/info/service-updates/elevators";
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/\s+/g, " ").trim();

export function parseStm(html: string, fetched: string): AccessibilityAlert[] {
  const out: AccessibilityAlert[] = [];
  const re = /<section class="item item-alert-elevator">([\s\S]*?)<\/section>/g;
  let m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(html))) {
    const sec = m[1];
    const line = /icon-line-(\d+)/.exec(sec)?.[1] ?? null;
    const title = /<div class="group-title-station-line">([\s\S]*?)<\/div>/.exec(sec)?.[1] ?? "";
    const station = strip(title).replace(/^\d+\s*/, "").trim();
    const message = strip(/<div class="group-title-station-message">([\s\S]*?)<\/div>/.exec(sec)?.[1] ?? "");
    const desc = strip(sec.replace(/<div class="group-title-station">[\s\S]*?<\/div>\s*<\/div>/, ""));
    if (!station) continue;
    out.push({ id: `stm-${i++}-${station}`, type: /escalator/i.test(message) ? "Escalator" : "Elevator", code: null, station, lat: null, lon: null, header: `${station}: ${desc || message}`, effect: "Out of service", severity: "", cause: null, causeDesc: /indefinite/i.test(desc) ? "Indefinite period" : null, planned: message, stops: line ? [line] : [], start: null, targetRemoval: null, updated: fetched });
  }
  return out;
}

export async function fetchStm(): Promise<{ alerts: AccessibilityAlert[]; fetched: string }> {
  const res = await fetch(URL_STM, { next: { revalidate: 300 }, headers: { "user-agent": "happy-map/0.1 (GatewayHacks project)", "accept-language": "en" } });
  if (!res.ok) throw new Error(`STM page HTTP ${res.status}`);
  const fetched = new Date().toISOString();
  return { alerts: parseStm(await res.text(), fetched), fetched };
}
