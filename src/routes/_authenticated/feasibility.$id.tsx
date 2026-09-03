import { createFileRoute } from "@tanstack/react-router";
import { BriefProgress } from "@/components/sir/BriefProgress";

export const Route = createFileRoute("/_authenticated/feasibility/$id")({
  head: () => ({
    meta: [
      { title: "Project Feasibility Progress — Permivio" },
      { name: "description", content: "Track the research and professional review of your Permivio Project Feasibility Report." },
      { property: "og:title", content: "Project Feasibility Progress — Permivio" },
      { property: "og:description", content: "Follow each research stage and download your reviewed feasibility report when it is released." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeasibilityDetailPage,
});

function FeasibilityDetailPage() {
  const { id } = Route.useParams();
  return <BriefProgress id={id} pageTitle="Project Feasibility" reportTitle="Project Feasibility Report" backTo="/feasibility" />;
}
