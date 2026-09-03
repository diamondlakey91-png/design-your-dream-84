import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ClipboardList, Scale, Search } from "lucide-react";
import { BriefWorkspace } from "@/components/sir/BriefWorkspace";

export const Route = createFileRoute("/_authenticated/feasibility/")({
  head: () => ({
    meta: [
      { title: "Project Feasibility Workspace — Permivio" },
      {
        name: "description",
        content:
          "Submit a project brief and get a researched Permivio Project Feasibility Report with a go / no-go verdict, potential deal-killers and conditions to proceed.",
      },
      { property: "og:title", content: "Permivio Project Feasibility Workspace" },
      {
        property: "og:description",
        content: "Research-backed feasibility verdicts, deal-killers and conditions to proceed — reviewed by a Permivio professional.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeasibilityWorkspacePage,
});

const STEPS = [
  { icon: ClipboardList, label: "1. Submit your brief", copy: "The site, the jurisdiction and the use you're considering." },
  { icon: Search, label: "2. Research runs", copy: "Zoning, permits, utilities, access and environmental constraints from published agency material." },
  { icon: Scale, label: "3. Feasibility verdict", copy: "A rating, potential deal-killers and the conditions to proceed — then professional review." },
  { icon: BadgeCheck, label: "4. Download the report", copy: "Your reviewed Project Feasibility Report as a branded PDF." },
];

function FeasibilityWorkspacePage() {
  return (
    <BriefWorkspace
      kind="feasibility"
      title="Project Feasibility"
      subtitle="Submit a brief and get a researched go / no-go read on the site before you commit."
      formTitle="New feasibility brief"
      formCopy="Tell us the site and the use you're weighing. Permivio's research agents work the constraints and return a documented verdict."
      steps={STEPS}
      detailTo="/feasibility/$id"
    />
  );
}
