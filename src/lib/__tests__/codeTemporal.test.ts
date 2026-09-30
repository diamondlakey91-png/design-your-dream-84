import { describe, it, expect } from "vitest";
import { resolveFamily, recheckAfter, applicableCodeDate, type CodeEvidence } from "../regIntel/codeTemporal";

const R = "2026-09-30";
const e = (x: Partial<CodeEvidence>): CodeEvidence => ({ layer: "state", state: "TX", family: "electrical", edition: null, retrieved_at: R, authority: "TDLR", source_type: "agency_current_code_page", url: "https://x.gov", quote: "q", primary: true, ...x });

describe("temporal code resolution", () => {
  it("Texas: newer adoption notice supersedes older 2023 page by effective date", () => {
    const ev = [
      e({ edition: "NEC 2023", effective_from: "2023-09-01", url: "https://tdlr.texas.gov/old" }),
      e({ edition: "NEC 2026", effective_from: "2026-09-01", source_type: "adoption_notice", url: "https://tdlr.texas.gov/new" }),
    ];
    const r = resolveFamily("TX", "electrical", ev, R);
    expect(r.current?.edition).toBe("NEC 2026");
    expect(r.status).toBe("current_verified");
    expect(r.superseded.map((s) => s.edition)).toEqual(["NEC 2023"]);
    expect(r.superseded[0]!.effective_to).toBe("2026-08-31");
    expect(r.why).toMatch(/superseded/);
  });
  it("Texas before the transition: 2026 is future-adopted, 2023 current", () => {
    const ev = [e({ edition: "NEC 2023", effective_from: "2023-09-01" }), e({ edition: "NEC 2026", effective_from: "2026-09-01", source_type: "adoption_notice" })];
    const r = resolveFamily("TX", "electrical", ev, "2026-06-01");
    expect(r.current?.edition).toBe("NEC 2023");
    expect(r.future[0]?.edition).toBe("NEC 2026");
    expect(r.recheck_after).toBe("2026-08-18");
  });
  it("Florida: development material never establishes a current edition", () => {
    const r = resolveFamily("FL", "electrical", [e({ state: "FL", edition: "NEC 2023", source_type: "development", authority: "FBC" })], R);
    expect(r.current).toBeNull();
    expect(r.status).toBe("unresolved");
    expect(r.proposed[0]?.edition).toBe("NEC 2023");
  });
  it("Massachusetts: 2026 NEC current from adopted rule", () => {
    const r = resolveFamily("MA", "electrical", [e({ state: "MA", edition: "NEC 2023", effective_from: "2023-02-17" }), e({ state: "MA", edition: "NEC 2026", effective_from: "2026-04-24", source_type: "rule" })], R);
    expect(r.current?.edition).toBe("NEC 2026");
    expect(r.superseded[0]?.effective_to).toBe("2026-04-23");
  });
  it("New Hampshire: fire code effective date from adoption evidence", () => {
    const r = resolveFamily("NH", "fire", [e({ state: "NH", family: "fire", edition: "NFPA 1/101 2021", effective_from: "2022-01-01" }), e({ state: "NH", family: "fire", edition: "NFPA 1/101 2024", effective_from: "2026-07-27", source_type: "adoption_notice" })], R);
    expect(r.current?.edition).toBe("NFPA 1/101 2024");
    expect(r.current?.effective_from).toBe("2026-07-27");
  });
  it("undated conflicting official sources → needs verification", () => {
    const r = resolveFamily("PA", "fire", [e({ state: "PA", family: "fire", edition: "IFC 2018" }), e({ state: "PA", family: "fire", edition: "IFC 2021" })], R);
    expect(r.status).toBe("current_needs_verification");
    expect(r.conflicts.length).toBe(1);
  });
  it("local-only states", () => {
    const r = resolveFamily("CO", "building", [e({ state: "CO", family: "building", local_only: true, authority: "OSA" })], R);
    expect(r.status).toBe("local_determination");
  });
  it("mirror-only evidence is never verified", () => {
    const r = resolveFamily("ME", "electrical", [e({ state: "ME", edition: "NEC 2023", effective_from: "2024-07-01", primary: false })], R);
    expect(r.status).toBe("current_needs_verification");
  });
  it("recheck and applicable date", () => {
    expect(recheckAfter(R, [], "current_verified")).toBe("2027-03-29");
    expect(applicableCodeDate({ today: R }).basis).toBe("today");
    expect(applicableCodeDate({ application_date: "2026-01-05T00:00:00Z", today: R }).date).toBe("2026-01-05");
  });
});

import { SEED_EVIDENCE } from "../regIntel/stateAdoptions";
describe("seeded evidence regressions (as of 2026-09-30)", () => {
  const res = (st: string, f: Parameters<typeof resolveFamily>[1]) => resolveFamily(st, f, SEED_EVIDENCE, "2026-09-30");
  it("TX NEC 2026 current, 2023 superseded", () => { const r = res("TX", "electrical"); expect(r.current?.edition).toBe("NEC 2026"); expect(r.superseded.map((s) => s.edition)).toContain("NEC 2023"); });
  it("FL electrical not promoted from development material", () => { const r = res("FL", "electrical"); expect(r.status).not.toBe("current_verified"); expect(r.current?.edition ?? null).toBeNull(); });
  it("MA NEC 2026 current", () => expect(res("MA", "electrical").current?.edition).toMatch(/2026/));
  it("NH fire 2024 effective 2026-07-27", () => { const r = res("NH", "fire"); expect(r.current?.edition).toMatch(/2024/); expect(r.current?.effective_from).toBe("2026-07-27"); });
  it("NC 2024 package not shown as current", () => expect(res("NC", "building").current?.edition).toMatch(/2018/));
  it("WA NEC 2026 future-adopted", () => { const r = res("WA", "electrical"); expect(r.current?.edition).toBe("NEC 2023"); expect(r.future[0]?.edition).toBe("NEC 2026"); expect(r.recheck_after).toBe("2026-12-17"); });
  it("CO building local; NEC 2026 current", () => { expect(res("CO", "building").status).toBe("local_determination"); expect(res("CO", "electrical").current?.edition).toBe("NEC 2026"); });
  it("prints matrix", () => {
    const fams = ["building", "electrical", "fire"] as const;
    for (const st of [...new Set(SEED_EVIDENCE.map((e) => e.state))]) console.log(st, fams.map((f) => { const r = res(st, f); return `${f}=${r.current?.edition ?? "-"}[${r.status}]${r.future.length ? ` future:${r.future.map((x) => x.edition + "@" + x.effective_from).join(",")}` : ""}${r.proposed.length ? ` proposed:${r.proposed.map((x) => x.edition).join(",")}` : ""}${r.superseded.length ? ` superseded:${r.superseded.map((x) => x.edition).join(",")}` : ""}`; }).join(" | "));
  });
});
