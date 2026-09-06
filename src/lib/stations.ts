/** Station names as the TTC alert feed writes them ("Bloor-Yonge", "St. George") against
 *  the names GTFS uses ("Bloor" and "Yonge", "St George"). Both sides are normalised the
 *  same way, so only genuinely different names need an alias. The feed's stop ids belong
 *  to a different id space than GTFS stop_id, so matching is by name. */
export const normName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^station\s+/i, "").replace(/\s+station$/i, "").replace(/[.'’]/g, "").replace(/[-–—/]+/g, " ").replace(/\s+/g, " ").trim();

/** feed name (normalised) → GTFS station names; one feed name can be two GTFS records */
export const ALIASES: Record<string, string[]> = {
  "bloor yonge": ["Bloor", "Yonge"],
  "yonge bloor": ["Bloor", "Yonge"],
  "dundas": ["TMU"],
  "vmc": ["Vaughan Metropolitan Centre"],
  "vaughan mc": ["Vaughan Metropolitan Centre"],
  "eglinton west": ["Cedarvale"],
  "sheppard": ["Sheppard-Yonge"],
  "yonge sheppard": ["Sheppard-Yonge"],
  "kennedy": ["Kennedy"],
  "hwy 407": ["Highway 407"],
  "highway 407": ["Highway 407"],
};

/** GTFS station names an alert refers to */
export function gtfsNamesFor(alertStation: string): string[] {
  const k = normName(alertStation);
  return ALIASES[k] ?? [alertStation];
}
