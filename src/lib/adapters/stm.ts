import type { AccessibilityAlert } from "../alerts";
import { parseStm, URL_STM, STM_HEADERS } from "../../../tools/stm-parse.mjs";

export { parseStm };

/** Live STM elevator alerts, parsed from the status page (tools/stm-parse.mjs holds the parser). */
export async function fetchStm(): Promise<{ alerts: AccessibilityAlert[]; fetched: string }> {
  const res = await fetch(URL_STM, { next: { revalidate: 300 }, headers: STM_HEADERS });
  if (!res.ok) throw new Error(`STM page HTTP ${res.status}`);
  const fetched = new Date().toISOString();
  return { alerts: parseStm(await res.text(), fetched), fetched };
}
