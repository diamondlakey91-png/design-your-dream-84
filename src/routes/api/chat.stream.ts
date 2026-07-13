import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const STAGE_NAMES = ["Pre-Planning", "Plans Submitted", "In Review", "Approved", "Issued"];

const SYSTEM_PROMPT = `You are the Permivio Permit Assistant — a specialist that helps contractors, architects, and developers identify the building, trade, planning, and regulatory permits required for construction projects in specific United States jurisdictions.

Core rules:
- Anchor every answer to the jurisdiction the user names (city + state, or county). If they didn't name one, ask for it before listing permits.
- If a [JURISDICTION CONTEXT] block is provided below, treat it as the source of truth. Cite its source URLs in parentheses next to any specific fee, timeline, or requirement you use from it.
- Cite the responsible department by name when you know it. If uncertain, say "the local Building Department" — never invent a department name.
- Distinguish permit types: building, MEP, fire, health, zoning/planning, sign, right-of-way, grading, demolition, stormwater, ADA, historic, environmental, and Certificate of Occupancy.
- Note when a permit typically requires stamped drawings or a licensed contractor of record.
- Be explicit about what you don't know and ask focused follow-ups when scope is missing.
- Never fabricate fee amounts, review timelines, or code section numbers. Without verified data, give a national typical range labeled as an estimate and recommend running "Live Jurisdiction Refresh".

Format:
- Start with a one-line summary tailored to the project + jurisdiction.
- Then a markdown list. Each item: **Permit / Approval** — one-line why, tagged [REQUIRED], [LIKELY], or [CONDITIONAL].
- End with one line: "Verify with <department name or 'the local Building Department'> — codes and thresholds change."

Keep answers tight. No filler, no repeated disclaimers.`;

function slugifyJurisdiction(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type JProfileRow = {
  name: string; state: string | null; department: string | null; portal_url: string | null;
  overview: string | null;
  permits: Array<{ name: string; when_required?: string; typical_reviewers?: string }> | null;
  fees: Array<{ label: string; detail?: string }> | null;
  timelines: Array<{ stage: string; typical_duration: string }> | null;
  source_urls: string[] | null;
  refreshed_at: string | null;
};

function isNewSupabaseApiKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

function makeSupabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export const Route = createFileRoute("/api/chat/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7);
        if (token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return new Response("Backend not configured", { status: 500 });
        if (!LOVABLE_API_KEY) return new Response("AI not configured", { status: 500 });

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: {
            fetch: makeSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claimData, error: claimErr } = await supabase.auth.getClaims(token);
        if (claimErr || !claimData?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = claimData.claims.sub;

        let body: { thread_id?: string; content?: string };
        try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
        const threadId = body.thread_id;
        const content = (body.content ?? "").trim();
        if (!threadId || !content) return new Response("Missing thread_id or content", { status: 400 });

        let { data: thread } = await supabase
          .from("chat_threads").select("*, projects(*)").eq("id", threadId).maybeSingle();
        if (!thread) {
          // Auto-provision missing thread (URL may point to a thread that was never persisted).
          const { data: created, error: cerr } = await supabase
            .from("chat_threads")
            .insert({ id: threadId, user_id: userId, title: "New chat" })
            .select("*, projects(*)").single();
          if (cerr || !created) return new Response(cerr?.message || "Thread not found", { status: 500 });
          thread = created;
        }

        const { data: history } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true })
          .limit(40);

        let projectContext = "";
        let jurisdictionBlock = "";
        const p = thread.projects as { name: string; project_type: string; location: string; jurisdiction: string; current_stage: number; permits_issued: number; permit_count: number } | null;
        if (p) {
          projectContext = `\n\n[Active project context]\n- Name: ${p.name}\n- Type: ${p.project_type}\n- Location: ${p.location || "unspecified"}\n- Jurisdiction: ${p.jurisdiction || "unspecified"}\n- Current stage: ${STAGE_NAMES[p.current_stage]} (${p.current_stage + 1}/5)\n- Permits: ${p.permits_issued}/${p.permit_count} issued`;
          if (p.jurisdiction) {
            const slug = slugifyJurisdiction(p.jurisdiction);
            if (slug) {
              const { data: profile } = await supabase
                .from("jurisdiction_profiles")
                .select("name, state, department, portal_url, overview, permits, fees, timelines, source_urls, refreshed_at")
                .eq("slug", slug)
                .maybeSingle() as { data: JProfileRow | null };
              if (profile) {
                const permitLines = (profile.permits ?? []).slice(0, 12).map((x) => `- ${x.name}${x.when_required ? ` — when: ${x.when_required}` : ""}`).join("\n") || "(none cached)";
                const feeLines = (profile.fees ?? []).slice(0, 10).map((f) => `- ${f.label}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") || "(none cached)";
                const timelineLines = (profile.timelines ?? []).slice(0, 10).map((t) => `- ${t.stage}: ${t.typical_duration}`).join("\n") || "(none cached)";
                const sources = (profile.source_urls ?? []).slice(0, 8).map((u) => `- ${u}`).join("\n") || "(none)";
                jurisdictionBlock = `\n\n[JURISDICTION CONTEXT — ${profile.name}${profile.state ? `, ${profile.state}` : ""}]\nDepartment: ${profile.department ?? "Building Department"}\nPortal: ${profile.portal_url ?? "(unknown)"}\nOverview: ${profile.overview ?? ""}\nPermits:\n${permitLines}\nFees:\n${feeLines}\nTimelines:\n${timelineLines}\nSources:\n${sources}\nPrefer facts from this block and cite the URLs.`;
              } else {
                jurisdictionBlock = `\n\n[JURISDICTION CONTEXT for "${p.jurisdiction}"]\nNo cached profile. Recommend running "Live Jurisdiction Refresh".`;
              }
            }
          }
        }

        // Insert user message
        const { error: uerr } = await supabase.from("chat_messages").insert({
          user_id: userId,
          thread_id: threadId,
          role: "user",
          content,
          parts: [{ type: "text", text: content }],
        });
        if (uerr) return new Response(uerr.message, { status: 500 });

        const messages = [
          { role: "system", content: SYSTEM_PROMPT + projectContext + jurisdictionBlock },
          ...((history ?? []) as Array<{ role: string; content: string }>),
          { role: "user", content },
        ];

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, stream: true }),
        });

        if (!upstream.ok || !upstream.body) {
          const txt = await upstream.text().catch(() => "");
          if (upstream.status === 429) return new Response("Too many requests — try again in a moment.", { status: 429 });
          if (upstream.status === 402) return new Response("AI credits exhausted. Please top up.", { status: 402 });
          return new Response(`AI error: ${txt.slice(0, 200)}`, { status: 502 });
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const reader = upstream.body!.getReader();
            let buffer = "";
            let full = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const raw of lines) {
                  const line = raw.trim();
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (payload === "[DONE]") continue;
                  try {
                    const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                      full += delta;
                      controller.enqueue(encoder.encode(delta));
                    }
                  } catch { /* ignore keep-alives / partial */ }
                }
              }
              // Persist assistant message
              if (full.trim()) {
                await supabase.from("chat_messages").insert({
                  user_id: userId,
                  thread_id: threadId,
                  role: "assistant",
                  content: full,
                  parts: [{ type: "text", text: full }],
                });
                await supabase.from("chat_threads")
                  .update({ last_message_at: new Date().toISOString() })
                  .eq("id", threadId);
              }
            } catch (e) {
              controller.enqueue(encoder.encode(`\n\n[stream error: ${e instanceof Error ? e.message : "unknown"}]`));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
