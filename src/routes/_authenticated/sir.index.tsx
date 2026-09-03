import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ClipboardList, Search, ShieldCheck } from "lucide-react";
import { BriefWorkspace } from "@/components/sir/BriefWorkspace";

export const Route = createFileRoute("/_authenticated/sir/")({
  head: () => ({
    meta: [
      { title: "Site Investigation Workspace — Permivio" },
      {
        name: "description",
        content:
          "Submit a site investigation brief, follow the jurisdiction research as it runs, and download your reviewed feasibility report.",
      },
      { property: "og:title", content: "Permivio Site Investigation Workspace" },
      {
        property: "og:description",
        content: "Submit a brief, track the research agents, and download your professionally reviewed Site Investigation Report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SirWorkspacePage,
});

const STEPS = [
  { icon: ClipboardList, label: "1. Submit your brief", copy: "Address, jurisdiction and what you intend to build." },
  { icon: Search, label: "2. Research runs", copy: "Permivio's research agents pull published agency material for that jurisdiction." },
  { icon: ShieldCheck, label: "3. Professional review", copy: "A Permivio professional reviews every finding before release." },
  { icon: BadgeCheck, label: "4. Download the report", copy: "Your reviewed report, as a branded PDF you can share." },
];

function SirWorkspacePage() {
  return (
    <BriefWorkspace
      kind="sir"
      title="Site Investigation"
      subtitle="Submit a brief, follow the research, and download your reviewed feasibility report."
      formTitle="New site investigation brief"
      formCopy="Tell us the site and what you want to do there. Permivio's research agents do the technical due-diligence work."
      steps={STEPS}
      detailTo="/sir/$id"
    />
  );
}
