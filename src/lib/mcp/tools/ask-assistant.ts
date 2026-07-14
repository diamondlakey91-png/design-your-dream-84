import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const SYSTEM_PROMPT = `You are the Permivio Permit Assistant. Answer permitting questions anchored to a specific U.S. jurisdiction. If the user hasn't named one, ask for it. Distinguish permit types (building, MEP, fire, health, zoning, sign, ROW, grading, demolition, stormwater, ADA, historic, environmental, C of O). Never fabricate fees, timelines, or code section numbers. End with: "Verify with the local Building Department — codes and thresholds change."`;

export default defineTool({
  name: "ask_permit_assistant",
  title: "Ask the permit assistant",
  description:
    "Ask the Permivio permit assistant a jurisdiction-specific permitting question. Include the city + state in the question for best results.",
  inputSchema: {
    question: z.string().describe("The permitting question. Include city + state when possible."),
    jurisdiction: z.string().optional().describe("Optional jurisdiction (e.g. 'Arlington County, VA')."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ question, jurisdiction }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { content: [{ type: "text", text: "AI not configured" }], isError: true };
    const userMsg = jurisdiction ? `Jurisdiction: ${jurisdiction}\n\n${question}` : question;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { content: [{ type: "text", text: `AI error ${res.status}: ${txt.slice(0, 300)}` }], isError: true };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { content: [{ type: "text", text }] };
  },
});
