import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PermivioMark } from "@/components/PermivioMark";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Permivio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Recovery links arrive with type=recovery in the URL hash; the Supabase
    // client exchanges it for a session and fires PASSWORD_RECOVERY.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setChecking(false);
      }
    });
    // Fallback: a session may already be established from the hash.
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) {
        setReady(true);
      }
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <div className="mb-8 flex items-center gap-2">
          <PermivioMark className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">PERMIVIO</span>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          OP_NEW_PASSWORD
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose a new password.</h1>

        {checking ? (
          <p className="mt-6 text-sm text-muted-foreground">Verifying your reset link…</p>
        ) : !ready ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-flex h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">NEW PASSWORD</span>
              <input
                type="password" required minLength={6} autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">CONFIRM PASSWORD</span>
              <input
                type="password" required minLength={6} autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand"
              />
            </label>
            <button
              type="submit" disabled={busy}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              {busy ? "Working…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
