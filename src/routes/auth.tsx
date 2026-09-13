import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { PermivioMark } from "@/components/PermivioMark";
import { ArrowLeft, MailCheck } from "lucide-react";

const authSearchSchema = z.object({
  next: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/auth")({
  validateSearch: zodValidator(authSearchSchema),
  head: () => ({
    meta: [
      { title: "Sign in — Permivio" },
      { name: "description", content: "Sign in to Permivio to manage your permit projects." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function safeNext(next: string): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const returnTo = safeNext(next);
  const isNativeApp =
    typeof window !== "undefined" &&
    (/(permivio-native|capacitor|CapacitorWebView)/i.test(window.navigator.userAgent) ||
      // Capacitor injects window.Capacitor on native
      Boolean((window as unknown as { Capacitor?: unknown }).Capacitor));
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const goAfterAuth = () => {
    if (returnTo) window.location.href = returnTo;
    else navigate({ to: "/dashboard" });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goAfterAuth();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogle = async () => {
    setBusy(true);
    const redirectUri = returnTo
      ? `${window.location.origin}${returnTo}`
      : window.location.origin;
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirectUri,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    goAfterAuth();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent — check your email.");
        setMode("sign-in");
        return;
      }
      if (mode === "sign-up") {
        const emailRedirectTo = returnTo
          ? `${window.location.origin}${returnTo}`
          : window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation required — do not navigate.
          setConfirmSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      goAfterAuth();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (confirmSent) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
          <div className="mb-8 flex items-center gap-2">
            <PermivioMark className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">PERMIVIO</span>
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <MailCheck className="mx-auto size-10 text-brand" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your email.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
              Click it to activate your account, then sign in.
            </p>
            <button
              onClick={() => { setConfirmSent(false); setMode("sign-in"); }}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand text-sm font-semibold text-brand-foreground"
            >
              Back to sign in
            </button>
          </div>
          <BrowseLinks />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <Link to="/" className="mb-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </Link>

        <div className="mb-8 flex items-center gap-2">
          <PermivioMark className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">PERMIVIO</span>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {mode === "sign-in" ? "OP_SIGN_IN" : mode === "sign-up" ? "OP_CREATE_ACCOUNT" : "OP_RESET_PASSWORD"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {mode === "sign-in" ? "Welcome back." : mode === "sign-up" ? "Set up your workspace." : "Reset your password."}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "sign-in"
            ? "Sign in to view your active sites and deadlines."
            : mode === "sign-up"
              ? "Create a Permivio account to start tracking your first project."
              : "Enter your account email and we'll send you a reset link."}
        </p>

        {!isNativeApp && mode !== "forgot" && (
          <>
            <button
              onClick={handleGoogle}
              disabled={busy}
              className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <svg className="size-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        {(isNativeApp || mode === "forgot") && <div className="mt-8" />}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">EMAIL</span>
            <input
              type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand"
            />
          </label>
          {mode !== "forgot" && (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">PASSWORD</span>
              <input
                type="password" required minLength={6}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand"
              />
            </label>
          )}
          <button
            type="submit" disabled={busy}
            className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}
          </button>
        </form>

        {mode === "sign-in" && (
          <button
            type="button"
            onClick={() => setMode("forgot")}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Forgot your password?
          </button>
        )}

        <button
          type="button"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          className="mt-3 text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "sign-in" ? "New here? Create an account →" : "Already have an account? Sign in →"}
        </button>

        <BrowseLinks />
      </div>
    </div>
  );
}

function BrowseLinks() {
  return (
    <div className="mt-10 border-t border-border pt-6">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Just looking around?
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        You don't need an account to explore Permivio.
      </p>
      <div className="mt-4 grid gap-2">
        <Link
          to="/pricing"
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          See plans & pricing <span aria-hidden>→</span>
        </Link>
        <Link
          to="/site-investigation"
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          Request a Site Investigation Report <span aria-hidden>→</span>
        </Link>
        <Link
          to="/"
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          Back to the homepage <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
