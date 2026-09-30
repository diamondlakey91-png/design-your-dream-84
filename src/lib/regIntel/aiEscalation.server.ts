// Server-only AI escalation for regulatory research. Used only when deterministic extraction found
// nothing on official text that clearly discusses the question. The AI may only point at sentences
// that literally exist in the supplied official text; every result stays Needs Verification.
import { withRegulatoryGrounding } from "@/lib/regulatoryGrounding";
import { aiFetch } from "@/lib/aiFetch";
import type { AuthorityEdge, AuthorityFunction, Relationship } from "./authorityGraph";

export const AI_MODEL = "google/gemini-2.5-flash";
const PRICE_IN = 0.3 / 1e6, PRICE_OUT = 2.5 / 1e6;

export type AiUsage = { calls: number; tokens: number; cost: number; model: string | null };

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Keep only AI answers whose quote is found verbatim (normalised) in the official text. */
export function groundQuotes<T extends { quote: string; url: string }>(items: T[], pages: Array<{ url: string; text: string }>): T[] {
  return items.filter((it) => {
    const p = pages.find((x) => x.url === it.url);
    const q = norm(it.quote);
    return !!p && q.length >= 25 && norm(p.text).includes(q);
  });
}

export async function aiExtractAuthority(args: {
  unit: string; county: string | null; state: string; pages: Array<{ url: string; text: string }>;
  userId: string | null; projectId: string | null; key: string;
}): Promise<{ edges: AuthorityEdge[]; usage: AiUsage }> {
  const usage: AiUsage = { calls: 0, tokens: 0, cost: 0, model: AI_MODEL };
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey || !args.pages.length) return { edges: [], usage };
  const body = args.pages.slice(0, 3).map((p, i) => `[[SOURCE ${i + 1}: ${p.url}]]\n${p.text.slice(0, 9000)}`).join("\n\n");
  const sys = withRegulatoryGrounding(`You read OFFICIAL government web text and report ONLY relationships the text states explicitly:
which agency administers building permits, zoning, electrical, plumbing/mechanical, fire review or septic permits for ${args.unit}${args.county ? ` (in ${args.county})` : ""}, ${args.state}.
Return JSON {"edges":[{"fn":"building|zoning|electrical|plumbing_mechanical|fire|health","agency":"exact agency name from the text","relationship":"direct|delegated|contracted|county_administered|state_administered|not_administered","applies_to":"all|residential|commercial","quote":"verbatim sentence copied from the source","source":1}]}.
Never infer from general knowledge. If the text does not say it, return {"edges":[]}.`, "research");
  const { runMeteredAi } = await import("@/lib/aiMeter.server");
  const out = await runMeteredAi({ db: null, userId: args.userId, operation: "regulatory_research_ai_extraction", creditType: null, key: args.key, projectId: args.projectId }, async () => {
    const res = await aiFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: body }] }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}`);
    return (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  }).catch(() => null);
  if (!out) return { edges: [], usage };
  usage.calls = 1;
  const pin = out.usage?.prompt_tokens ?? 0, pout = out.usage?.completion_tokens ?? 0;
  usage.tokens = pin + pout;
  usage.cost = pin * PRICE_IN + pout * PRICE_OUT;
  let parsed: { edges?: Array<{ fn: AuthorityFunction; agency: string; relationship: Relationship; applies_to: AuthorityEdge["applies_to"]; quote: string; source: number }> } = {};
  try { parsed = JSON.parse(out.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
  const cand = (parsed.edges ?? []).map((e) => ({ ...e, url: args.pages[(e.source ?? 1) - 1]?.url ?? "" }));
  const grounded = groundQuotes(cand, args.pages);
  return {
    edges: grounded.map((e) => ({ fn: e.fn, agency: e.agency, relationship: e.relationship, applies_to: e.applies_to ?? "all", quote: e.quote.slice(0, 400), url: e.url, page: null, origin: "ai_extraction" as const })),
    usage,
  };
}
