import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, MessageSquare, Library, LogOut, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WelcomeBanner } from "@/components/WelcomeBanner";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const active = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="relative min-h-dvh bg-background pb-28 text-foreground">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(60rem 40rem at 15% -10%, oklch(0.66 0.19 258 / 0.12), transparent 60%), radial-gradient(50rem 40rem at 100% 10%, oklch(0.68 0.19 305 / 0.10), transparent 60%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8">
        <WelcomeBanner />
      </div>
      <div className="mx-auto max-w-7xl px-0 lg:px-8">{children}</div>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-6 py-3">
          <NavItem to="/dashboard" icon={<Home className="size-5" />} label="Sites" active={active("/dashboard")} />
          <NavItem to="/lookup" icon={<MapPin className="size-5" />} label="Lookup" active={active("/lookup")} />
          <Link
            to="/assistant"
            className="grid size-14 -mt-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_40px_-8px_oklch(0.66_0.19_258/0.6)] ring-4 ring-background"
            aria-label="AI assistant"
          >
            <MessageSquare className="size-5" />
          </Link>
          <NavItem to="/jurisdictions" icon={<Library className="size-5" />} label="Library" active={active("/jurisdictions")} />
          <button
            onClick={signOut}
            className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="size-5" />
            <span className="font-mono text-[9px] uppercase tracking-widest">Out</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label, active }: { to: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-1 transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="font-mono text-[9px] uppercase tracking-widest">{label}</span>
    </Link>
  );
}
