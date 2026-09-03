import { createFileRoute } from "@tanstack/react-router";
import { BriefProgress } from "@/components/sir/BriefProgress";

export const Route = createFileRoute("/_authenticated/sir/$id")({
  head: () => ({
    meta: [
      { title: "Site Investigation Progress — Permivio" },
      { name: "description", content: "Track the research and professional review of your Permivio Site Investigation Report." },
      { property: "og:title", content: "Site Investigation Progress — Permivio" },
      { property: "og:description", content: "Follow each research stage and download your reviewed report when it is released." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SirBriefDetailPage,
});

function SirBriefDetailPage() {
  const { id } = Route.useParams();
  return <BriefProgress id={id} pageTitle="Site Investigation" reportTitle="Site Investigation Report" backTo="/sir" />;
}
