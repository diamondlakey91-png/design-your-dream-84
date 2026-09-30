// PERMIVIO — relevant regulatory-profile context for Plan Review (only what a plan reviewer needs).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function regulatoryContextBlock(sb: any, projectId: string): Promise<string> {
  const { data } = await sb.from("project_regulatory_facts")
    .select("fact_type,fact_key,label,display_value,verification,source_org")
    .eq("project_id", projectId)
    .in("fact_type", ["jurisdiction", "agency", "flood", "zoning", "code", "local_amendment", "special_condition", "permit_candidate"]);
  const rows = (data ?? []) as Array<{ fact_type: string; fact_key: string; label: string; display_value: string | null; verification: string; source_org: string | null }>;
  const keep = rows.filter((r) =>
    (r.fact_type === "jurisdiction" && ["municipal_status", "county"].includes(r.fact_key)) ||
    (r.fact_type === "agency" && r.fact_key === "building") ||
    (r.fact_type === "flood" && ["zone", "sfha", "bfe"].includes(r.fact_key)) ||
    (r.fact_type === "zoning" && r.fact_key === "district") ||
    ["code", "local_amendment", "special_condition", "permit_candidate"].includes(r.fact_type));
  if (!keep.length) return "";
  const line = (r: (typeof keep)[number]) => `- ${r.label}: ${r.display_value ?? "not established"} [${r.verification.replace("_", " ")}${r.source_org ? `; source: ${r.source_org}` : ""}]`;
  return `REGULATORY PROFILE (researched; treat anything not "verified" as unconfirmed):\n${keep.map(line).join("\n")}`;
}
