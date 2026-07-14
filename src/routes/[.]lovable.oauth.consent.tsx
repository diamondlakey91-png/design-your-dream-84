import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{
    data: {
      client?: { name?: string; redirect_uri?: string } | null;
      scope?: string | null;
      redirect_url?: string | null;
      redirect_to?: string | null;
    } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oauth = (supabase.auth as any).oauth as OAuthNs;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-dvh grid place-items-center bg-background text-foreground p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold mb-2">Could not load authorization request</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="min-h-dvh grid place-items-center bg-background text-foreground p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-brand">
            <div className="size-3.5 rounded-sm border-2 border-ink/30" />
          </div>
          <span className="font-semibold">Permivio</span>
        </div>
        <h1 className="text-lg font-semibold">Connect {clientName} to Permivio</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} use Permivio as you — reading your projects, checklists, deadlines, and asking the permit assistant on your behalf.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          This does not bypass Permivio's permissions or backend policies.
        </p>
        {error && <p className="mt-3 text-sm text-red-500" role="alert">{error}</p>}
        <div className="mt-6 flex gap-2">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 h-10 rounded-lg bg-brand text-brand-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 h-10 rounded-lg border border-border text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
