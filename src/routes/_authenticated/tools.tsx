import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { ServiceProductCard } from "@/components/tools/ServiceProductCard";
import { ServiceCheckoutDialog } from "@/components/tools/ServiceCheckoutDialog";
import { FullServiceDialog } from "@/components/tools/FullServiceDialog";
import { PurchasedServicesList, type ReportVersion } from "@/components/tools/PurchasedServicesList";
import { getToolsOverview } from "@/lib/toolsReports.functions";
import {
  DISCLAIMER,
  recommendFor,
  type DeliveryTier,
  type ProjectLite,
  type ServiceOrder,
  type ServiceProduct,
} from "@/lib/toolsCatalog";

export const Route = createFileRoute("/_authenticated/tools")({
  component: ToolsAndReportsPage,
  head: () => ({
    meta: [
      { title: "Tools & Reports | PERMIVIO Permitting Services" },
      {
        name: "description",
        content:
          "Purchase individual PERMIVIO permitting tools and reports — site feasibility, permit requirements, plan QA/QC and more — for any project.",
      },
      { property: "og:title", content: "Tools & Reports | PERMIVIO" },
      {
        property: "og:description",
        content: "Buy the exact permitting report you need, or have PERMIVIO handle the whole project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function ToolsAndReportsPage() {
  const fetchOverview = useServerFn(getToolsOverview);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tools-overview"],
    queryFn: () => fetchOverview(),
  });

  const [projectId, setProjectId] = useState<string>("");
  const [checkout, setCheckout] = useState<{ product: ServiceProduct; tier: DeliveryTier } | null>(null);
  const [fullService, setFullService] = useState(false);

  const products = (data?.products ?? []) as unknown as ServiceProduct[];
  const projects = (data?.projects ?? []) as unknown as ProjectLite[];
  const orders = (data?.orders ?? []) as unknown as ServiceOrder[];
  const versions = (data?.versions ?? []) as unknown as ReportVersion[];

  const project = projects.find((p) => p.id === projectId) ?? null;

  const purchasedKeys = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p.product_key]));
    const set = new Set<string>();
    for (const o of orders) {
      if (project && o.project_id !== project.id) continue;
      if (o.status === "payment_required" || o.status === "cancelled" || o.status === "refunded") continue;
      const key = byId.get(o.product_id);
      if (key) set.add(key);
    }
    return set;
  }, [orders, products, project]);

  const productTitles = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.client_title])),
    [products],
  );
  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const signals = { documentCount: 0, hasComments: false, purchasedKeys };
  const ranked = useMemo(() => {
    const order = { recommended: 0, available: 1, completed: 2, later: 3 } as const;
    return products
      .map((p) => ({ product: p, rec: recommendFor(p, project, signals) }))
      .sort((a, b) => order[a.rec] - order[b.rec] || a.product.display_order - b.product.display_order);
  }, [products, project, purchasedKeys]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 lg:px-8">
      <PermivioPageHeader
        eyebrow="Tools & Reports"
        title="Buy only what your project needs"
        subtitle="Get a single report on demand, add a professional review, or hand the whole project to Permivio. Everything you purchase stays saved to your project."
        actions={
          <button
            onClick={() => setFullService(true)}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Have Permivio handle it
          </button>
        }
      />

      <section className="rounded-3xl border border-border bg-card p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Which project is this for?
          </span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-11 w-full max-w-md rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
          >
            <option value="">Not linked to a project yet</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.location ? ` — ${p.location}` : ""}
              </option>
            ))}
          </select>
        </label>
        {project && (
          <p className="mt-3 text-xs text-muted-foreground">
            Recommendations below are based on where {project.name} is today. Reports you buy are saved to this project.
          </p>
        )}
      </section>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading available services…
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Available services</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {ranked.map(({ product, rec }) => (
              <ServiceProductCard
                key={product.id}
                product={product}
                recommendation={rec}
                onBuy={(tier) => setCheckout({ product, tier })}
                onFullService={() => setFullService(true)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your tools & reports</h2>
        <PurchasedServicesList
          orders={project ? orders.filter((o) => o.project_id === project.id) : orders}
          versions={versions}
          productTitles={productTitles}
          projectNames={projectNames}
        />
      </section>

      <p className="rounded-3xl border border-border bg-card/60 p-5 text-xs text-muted-foreground">{DISCLAIMER}</p>

      {checkout && (
        <ServiceCheckoutDialog
          product={checkout.product}
          tier={checkout.tier}
          project={project}
          onClose={() => {
            setCheckout(null);
            void refetch();
          }}
        />
      )}
      {fullService && <FullServiceDialog project={project} onClose={() => setFullService(false)} />}
    </div>
  );
}
