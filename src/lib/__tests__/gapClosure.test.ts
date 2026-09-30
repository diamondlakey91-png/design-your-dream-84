import { describe, it, expect } from "vitest";
import { extractAuthorityRelations, resolveAuthorityGraph } from "@/lib/regIntel/authorityGraph";
import { findPassages, isScanned, documentAuthority, documentDates, classifyDocKind } from "@/lib/regIntel/officialDocs";
import { resolveFamily, reconcileLocal, type CodeEvidence } from "@/lib/regIntel/codeTemporal";
import { groundQuotes } from "@/lib/regIntel/aiEscalation.server";

describe("layered AHJ — authority relations", () => {
  it("township page naming the county as building authority (Blendon-style regression)", () => {
    const t = "Blendon Township handles zoning permits for properties in the township. Building permits are issued by the Franklin County Economic Development and Planning Department.";
    const e = extractAuthorityRelations(t, { self: "Blendon township", url: "https://x.gov/p" });
    const b = e.find((x) => x.fn === "building")!;
    expect(b.agency).toMatch(/Franklin County/);
    expect(b.relationship).toBe("county_administered");
  });
  it("explicit negative statement", () => {
    const e = extractAuthorityRelations("The Township does not issue building permits.", { self: "Example township", url: null });
    expect(e[0]!.relationship).toBe("not_administered");
  });
  it("contracted services and residential/commercial split", () => {
    const e = [
      ...extractAuthorityRelations("The Village contracts with the Summit County Building Standards Department for building inspection services.", { self: "Village of X", url: "u" }),
      ...extractAuthorityRelations("Commercial building permits are issued by the Ohio Division of Industrial Compliance. Residential building permits are issued by the Summit County Building Standards Department.", { self: "Village of X", url: "u" }),
    ];
    expect(e.some((x) => x.relationship === "contracted")).toBe(true);
    const g = resolveAuthorityGraph(e.filter((x) => x.relationship !== "contracted"), { agency: null, basis: "" }, ["building"]);
    expect(g[0]!.status).toBe("split");
  });
  it("no evidence → presumption only, never a fabricated agency", () => {
    const g = resolveAuthorityGraph([], { agency: null, basis: "weak MCD state" }, ["building"]);
    expect(g[0]!.status).toBe("unresolved");
  });
});

describe("official documents", () => {
  it("page-anchored passages with section", () => {
    const r = findPassages(["cover", "Section 150.01 The 2021 International Building Code is hereby adopted."], /hereby adopted/i);
    expect(r[0]).toMatchObject({ page: 2, section: "Section 150.01" });
  });
  it("scanned documents are detected", () => { expect(isScanned(["", " ", "x"])).toBe(true); });
  it("authority classification never trusts arbitrary hosts", () => {
    expect(documentAuthority("https://www.raleighnc.gov/a.pdf", ["raleighnc.gov"])).toBe("issuing_government");
    expect(documentAuthority("https://random-blog.com/a.pdf", ["raleighnc.gov"])).toBe("unconfirmed");
  });
  it("dates and kind", () => {
    const d = documentDates(["Ordinance 2023-14 adopted on March 3, 2023, effective July 1, 2023"]);
    expect(d.effective).toBe("2023-07-01");
    expect(classifyDocKind("Ordinance", "An ordinance to adopt the building code")).toBe("code_adoption_ordinance");
  });
});

describe("stale local official source", () => {
  const ev = (layer: "state" | "local", edition: string, eff: string | null, type: CodeEvidence["source_type"]): CodeEvidence => ({ layer, state: "NC", jurisdiction_key: "k", family: "building", edition, effective_from: eff, retrieved_at: "2026-09-30", authority: "a", source_type: type, url: `u-${edition}`, quote: "q", primary: true });
  it("old city page does not defeat newer statewide adoption", () => {
    const l = resolveFamily("NC", "building", [ev("local", "2015 IBC", null, "informational")], "2026-09-30", "local", "k");
    const s = resolveFamily("NC", "building", [ev("state", "2018 IBC", "2019-01-01", "rule")], "2026-09-30");
    expect(reconcileLocal(l, s, false).status).toBe("local_stale");
  });
});

describe("AI grounding", () => {
  it("drops AI quotes not literally present in the official text", () => {
    const pages = [{ url: "a", text: "Building permits are issued by the Franklin County Building Division for all residents." }];
    const r = groundQuotes([{ url: "a", quote: "Building permits are issued by the Franklin County Building Division" }, { url: "a", quote: "Permits are issued by the State of Ohio for everything here" }], pages);
    expect(r).toHaveLength(1);
  });
});
