import { describe, it, expect } from "vitest";
import { checkFilingTransition, customerMaySetJurisdictionStatus } from "../trustedStates";

const base = { status: "ready_to_submit", approved_at: "2026-09-30T00:00:00Z", confirmation_number: null, status_source: null };

describe("permit filing status (M3)", () => {
  it("draft edits are not authoritative", () => {
    expect(checkFilingTransition(base, { status: "withdrawn" })).toBeNull();
    expect(checkFilingTransition({ ...base, status: "draft", approved_at: null }, { status: "preflight" })).toBeNull();
  });
  it("submission requires approval, confirmation number and source", () => {
    expect(checkFilingTransition({ ...base, approved_at: null }, { status: "monitoring", confirmation_number: "A1", status_source: "Portal" })).toMatch(/approved/);
    expect(checkFilingTransition(base, { status: "monitoring", status_source: "Portal" })).toMatch(/confirmation/);
    expect(checkFilingTransition(base, { status: "submitted", confirmation_number: "A1" })).toMatch(/source/);
    expect(checkFilingTransition(base, { status: "monitoring", confirmation_number: "A1", status_source: "Portal" })).toBeNull();
  });
  it("issued requires a prior submission and a source", () => {
    expect(checkFilingTransition(base, { status: "issued", status_source: "Portal" })).toMatch(/submission/);
    expect(checkFilingTransition({ ...base, status: "monitoring", confirmation_number: "A1", status_source: "Portal" }, { status: "issued" })).toBeNull();
  });
});

describe("jurisdiction confirmation (M4)", () => {
  it("customers may confirm or request review but never human-verify", () => {
    expect(customerMaySetJurisdictionStatus("user_confirmed")).toBe(true);
    expect(customerMaySetJurisdictionStatus("pending_review")).toBe(true);
    expect(customerMaySetJurisdictionStatus("human_verified")).toBe(false);
  });
});
