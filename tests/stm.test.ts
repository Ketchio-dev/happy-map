import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseStm } from "@/lib/adapters/stm";
import { normName } from "@/lib/stations";

// the STM elevator page as fetched on 2026-09-06 (two elevators out, both on the Green line)
const html = readFileSync("tests/fixtures/stm-elevators-2026-09-06.html", "utf8");

describe("parseStm", () => {
  const alerts = parseStm(html, "2026-09-06T15:00:00Z");
  it("finds every alert section and names the station without the line number", () => {
    expect(alerts.length).toBe((html.match(/item-alert-elevator/g) ?? []).length);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) { expect(a.station).not.toMatch(/^\d/); expect(a.station.length).toBeGreaterThan(2); expect(a.effect).toBe("Out of service"); }
  });
  it("carries the line id and the description into the header", () => {
    const first = alerts[0];
    expect(first.stops).toEqual(["1"]);
    expect(first.station).toBe("Place-des-Arts");
    expect(first.header).toMatch(/^Place-des-Arts: .*out of service/i);
    expect(first.causeDesc).toBe("Indefinite period");
  });
  it("normalises accented station names the same way as GTFS names", () => {
    expect(normName("Station Côte-Vertu")).toBe("cote vertu");
    expect(normName("Côte-Vertu")).toBe("cote vertu");
    expect(normName("Longueuil–Université-de-Sherbrooke")).toBe("longueuil universite de sherbrooke");
  });
});
