import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { leadCompileAndGate } from "@/lib/sirLeadOrchestrator.server";
test("gate on stored research", () => {
  const row = JSON.parse(readFileSync("/tmp/qa/row.json", "utf8"));
  const r = leadCompileAndGate(row.research, { sources: row.research_sources, audit: row.research_audit });
  console.log(r.review_stage, r.qa.status, JSON.stringify(r.qa.checks.filter(c=>c.status==="fail"), null, 1));
  expect(r.qa.checks.length).toBeGreaterThan(5);
});
