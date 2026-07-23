import { describe, it, expect } from "vitest";
import {
  PORTAL_REGISTRY,
  PORTAL_PLATFORMS,
  US_STATES,
  govSearchUrl,
  findPortalDeepLinks,
  parseJurisdiction,
  normalize,
  buildEntryFromMapping,
  type PortalEntry,
} from "../portalRegistry";

const isValidHttpsUrl = (u: string) => {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" && parsed.hostname.includes(".");
  } catch {
    return false;
  }
};

describe("PORTAL_REGISTRY integrity", () => {
  it("has entries", () => {
    expect(PORTAL_REGISTRY.length).toBeGreaterThan(50);
  });

  it("every entry has required fields", () => {
    for (const e of PORTAL_REGISTRY) {
      expect(e.jurisdiction, `${e.jurisdiction}`).toBeTruthy();
      expect(e.state, `${e.jurisdiction} state`).toMatch(/^[A-Z]{2}$/);
      expect(PORTAL_PLATFORMS).toContain(e.platform);
      expect(e.url, `${e.jurisdiction} url`).toBeTruthy();
    }
  });

  it("every url is a valid https URL", () => {
    for (const e of PORTAL_REGISTRY) {
      expect(isValidHttpsUrl(e.url), `${e.jurisdiction} (${e.state}) → ${e.url}`).toBe(true);
    }
  });

  it("every state is a real US state or DC", () => {
    for (const e of PORTAL_REGISTRY) {
      expect(US_STATES, `${e.jurisdiction}`).toContain(e.state);
    }
  });

  it("addressSearch builders produce valid https URLs containing the query", () => {
    const sample = "123 Main St";
    for (const e of PORTAL_REGISTRY) {
      if (!e.addressSearch) continue;
      const url = e.addressSearch(sample);
      expect(isValidHttpsUrl(url), `${e.jurisdiction} address → ${url}`).toBe(true);
      // URL-encoded token should appear
      expect(url.toLowerCase()).toMatch(/main/);
    }
  });

  it("permitSearch builders produce valid https URLs containing the number", () => {
    const sample = "B2024-00123";
    for (const e of PORTAL_REGISTRY) {
      if (!e.permitSearch) continue;
      const url = e.permitSearch(sample);
      expect(isValidHttpsUrl(url), `${e.jurisdiction} permit → ${url}`).toBe(true);
      expect(url).toMatch(/B2024/);
    }
  });

  it("Accela entries use aca-prod.accela.com or a CitizenAccess-hosted portal", () => {
    for (const e of PORTAL_REGISTRY.filter((x) => x.platform === "Accela")) {
      const ok =
        /^https:\/\/aca-prod\.accela\.com\//.test(e.url) ||
        /citizenaccess/i.test(e.url) ||
        /accela/i.test(e.url);
      expect(ok, `${e.jurisdiction} → ${e.url}`).toBe(true);
    }
  });

  it("aca-prod Accela slugs are non-empty and URL-safe", () => {
    for (const e of PORTAL_REGISTRY.filter((x) => x.platform === "Accela")) {
      const m = e.url.match(/aca-prod\.accela\.com\/([^/]+)\//);
      if (!m) continue; // self-hosted Accela installations don't use slugs
      const slug = m[1];
      expect(slug.length).toBeGreaterThan(0);
      expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("has no duplicate (jurisdiction, state, platform) entries", () => {
    const seen = new Set<string>();
    for (const e of PORTAL_REGISTRY) {
      const key = `${e.jurisdiction.toLowerCase().trim()}|${e.state}|${e.platform}`;
      expect(seen.has(key), `duplicate: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("planReviewUrl, when set, is a valid https URL", () => {
    for (const e of PORTAL_REGISTRY) {
      if (!e.planReviewUrl) continue;
      expect(isValidHttpsUrl(e.planReviewUrl), `${e.jurisdiction} planReviewUrl`).toBe(true);
    }
  });
});

describe("govSearchUrl fallback", () => {
  it("produces a scoped .gov Google search URL", () => {
    const url = govSearchUrl("Arlington County", "VA");
    expect(isValidHttpsUrl(url)).toBe(true);
    expect(url).toMatch(/google\.com\/search/);
    expect(decodeURIComponent(url)).toMatch(/site:\.gov/);
    expect(decodeURIComponent(url)).toMatch(/Arlington County/);
  });
});

describe("parseJurisdiction", () => {
  it("parses '<name>, <ST>'", () => {
    expect(parseJurisdiction("Arlington County, VA")).toEqual({ name: "arlington", state: "VA" });
  });
  it("parses full state names", () => {
    expect(parseJurisdiction("Anne Arundel County, Maryland").state).toBe("MD");
  });
  it("handles missing state", () => {
    expect(parseJurisdiction("Fairfax").state).toBeNull();
  });
  it("returns empty for empty input", () => {
    expect(parseJurisdiction("")).toEqual({ name: "", state: null });
  });
});

describe("findPortalDeepLinks", () => {
  it("returns matches with a valid deepLink for a known jurisdiction", () => {
    const matches = findPortalDeepLinks("Arlington County, VA", { address: "2100 Clarendon Blvd" });
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(isValidHttpsUrl(m.deepLink)).toBe(true);
      expect(["permit", "address", "home"]).toContain(m.linkKind);
    }
  });

  it("prefers permit number over address when both are given", () => {
    const [m] = findPortalDeepLinks("Arlington County, VA", {
      permitNumber: "B2024-00123",
      address: "2100 Clarendon Blvd",
    });
    if (m && m.entry.permitSearch) {
      expect(m.linkKind).toBe("permit");
    }
  });

  it("returns [] for empty input", () => {
    expect(findPortalDeepLinks("")).toEqual([]);
  });
});

describe("buildEntryFromMapping", () => {
  it("fills templates and defaults platform to Custom for unknowns", () => {
    const e: PortalEntry = buildEntryFromMapping({
      jurisdiction: "Testville",
      state: "TX",
      platform: "NotARealPlatform",
      url: "https://example.gov",
      address_search_template: "https://example.gov/s?a={q}",
      permit_search_template: "https://example.gov/s?p={q}",
    });
    expect(e.platform).toBe("Custom");
    expect(e.addressSearch!("123 Main")).toBe("https://example.gov/s?a=123%20Main");
    expect(e.permitSearch!("B-1")).toBe("https://example.gov/s?p=B-1");
  });
});
