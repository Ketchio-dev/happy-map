/** How much of the clear-sky sun actually arrives under a given cloud cover.
 *  Kasten & Czeplak (1980): global irradiance under cloud fraction N is G0 · (1 − 0.75 N^3.4).
 *  Thin cloud barely matters; a fully overcast sky still passes a quarter of the energy, so
 *  shade keeps a little weight rather than none. The ratio scales the shade penalty in the router. */
export function skyFactor(cloudPct: number | null | undefined): number {
  if (cloudPct === null || cloudPct === undefined || !Number.isFinite(cloudPct)) return 1;
  const n = Math.min(1, Math.max(0, cloudPct / 100));
  return +(1 - 0.75 * Math.pow(n, 3.4)).toFixed(3);
}
