import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjectsTool from "./tools/list-projects";
import getProjectTool from "./tools/get-project";
import listChecklistTool from "./tools/list-checklist";
import listDeadlinesTool from "./tools/list-deadlines";
import askAssistantTool from "./tools/ask-assistant";
import reviewPlansTool from "./tools/review-plans";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "permivio-mcp",
  title: "Permivio",
  version: "0.1.0",
  instructions:
    "Tools for Permivio — a permit tracking assistant. Use these to list the signed-in user's permit projects, read their checklists and deadlines, and ask the Permivio permit assistant jurisdiction-specific questions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjectsTool, getProjectTool, listChecklistTool, listDeadlinesTool, askAssistantTool],
});
