import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileSearch,
  FolderKanban,
  LayoutDashboard,
  Library,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  User,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PermivioLogo } from "@/components/PermivioMark";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getClientDashboard } from "@/lib/clientDashboard.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavLink = { to: string; label: string; icon: typeof MapPin; description?: string };

/** Always-visible primary destinations. */
const PRIMARY: NavLink[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/jurisdictions", label: "Jurisdiction Research", icon: Library },
];

/** Grouped under the "Tools" dropdown on desktop, listed inline on mobile. */
const TOOLS: NavLink[] = [
  {
    to: "/assistant/screens",
    label: "Site Investigation Reports",
    icon: Building2,
    description: "Feasibility & site screening",
  },
  {
    to: "/report",
    label: "Plan Review / QA-QC",
    icon: FileSearch,
    description: "Compliance & plan review reports",
  },
  { to: "/lookup", label: "Permit Lookup", icon: MapPin, description: "Live permits by address" },
  { to: "/property", label: "Property Analysis", icon: Sparkles, description: "Zoning & site constraints" },
  { to: "/filing", label: "Permit Filing", icon: Send, description: "Submission workflow" },
  { to: "/portals", label: "Portal Directory", icon: Library, description: "Nationwide agency portals" },
];

const SERVICES: NavLink = { to: "/tools", label: "Services & Tools", icon: ShoppingBag };
const SUPPORT: NavLink = { to: "/assistant", label: "Messages & Support", icon: MessageSquare };
const ADMIN: NavLink[] = [
  { to: "/admin/portals", label: "Admin · Portals", icon: ShieldCheck },
  { to: "/admin/health-portals", label: "Admin · Health Portals", icon: ShieldCheck },
  { to: "/admin/sir", label: "Admin · SIR Requests", icon: ShieldCheck },
  { to: "/harvest", label: "Admin · Portal Harvest", icon: Wrench },
];

function useActive() {
  const location = useLocation();
  return (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");
}

export function AppNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const active = useActive();
  const [open, setOpen] = useState(false);
  const adminQ = useIsAdmin();
  const isAdmin = adminQ.data === true;

  const clientFn = useServerFn(getClientDashboard);
  const dataQ = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: () => clientFn(),
    staleTime: 60_000,
  });

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const updates = useMemo(
    () => (dataQ.data?.activity ?? []).slice(0, 6),
    [dataQ.data?.activity],
  );

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const toolsActive = TOOLS.some((t) => active(t.to));
  const profileName = dataQ.data?.profile?.full_name?.trim() || null;

  return (
    <TooltipProvider delayDuration={200}>
      <header className="sticky top-0 z-40 w-full overflow-x-clip border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 lg:px-8">
          <Link to="/dashboard" aria-label="Permivio home" className="shrink-0">
            <PermivioLogo />
          </Link>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
            {PRIMARY.map((l) => (
              <TopLink key={l.to} link={l} active={active(l.to)} />
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  toolsActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tools <ChevronDown className="size-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel>Tools & reports</DropdownMenuLabel>
                {TOOLS.map((t) => (
                  <DropdownMenuItem key={t.to} asChild>
                    <Link to={t.to} className="flex items-start gap-2.5">
                      <t.icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{t.label}</span>
                        {t.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {t.description}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <TopLink link={SERVICES} active={active(SERVICES.to)} />
            <TopLink link={SUPPORT} active={active(SUPPORT.to)} />
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Notifications */}
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger
                    aria-label="Notifications"
                    className="relative rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Bell className="size-4" aria-hidden />
                    {updates.length > 0 ? (
                      <span
                        aria-hidden
                        className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                      />
                    ) : null}
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="w-80 p-0">
                <p className="border-b border-border px-3 py-2 text-sm font-medium">Latest updates</p>
                <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                  {updates.length === 0 ? (
                    <li className="px-3 py-4 text-sm text-muted-foreground">
                      You're all caught up.
                    </li>
                  ) : (
                    updates.map((u) => (
                      <li key={u.id} className="px-3 py-2.5">
                        <p className="text-sm text-foreground">{u.description}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </PopoverContent>
            </Popover>

            {/* Profile menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <User className="size-4" aria-hidden />
                <ChevronDown className="hidden size-3.5 sm:block" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="truncate">
                  {profileName ?? "Your account"}
                  {email ? (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {email}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2">
                    <User className="size-4" aria-hidden /> My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2">
                    <Wrench className="size-4" aria-hidden /> Account Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/tools" className="flex items-center gap-2">
                    <CreditCard className="size-4" aria-hidden /> Billing & Purchases
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/assistant" className="flex items-center gap-2">
                    <CircleHelp className="size-4" aria-hidden /> Help / Support
                  </Link>
                </DropdownMenuItem>
                {isAdmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Administration</DropdownMenuLabel>
                    {ADMIN.map((a) => (
                      <DropdownMenuItem key={a.to} asChild>
                        <Link to={a.to} className="flex items-center gap-2">
                          <a.icon className="size-4" aria-hidden /> {a.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="flex items-center gap-2">
                  <LogOut className="size-4" aria-hidden /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="permivio-mobile-nav"
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        {/* Mobile / tablet menu */}
        {open ? (
          <>
            <div
              aria-hidden
              onClick={() => setOpen(false)}
              className="fixed inset-0 top-[57px] z-30 bg-background/60 lg:hidden"
            />
            <nav
              id="permivio-mobile-nav"
              aria-label="Mobile"
              className="relative z-40 max-h-[75dvh] overflow-y-auto overflow-x-hidden border-t border-border bg-background/95 px-4 py-3 lg:hidden"
            >
              <ul className="space-y-1">
                {[...PRIMARY, SERVICES, SUPPORT].map((l) => (
                  <MobileItem key={l.to} link={l} active={active(l.to)} />
                ))}
              </ul>
              <p className="mt-4 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Tools & reports
              </p>
              <ul className="mt-1 space-y-1">
                {TOOLS.map((l) => (
                  <MobileItem key={l.to} link={l} active={active(l.to)} />
                ))}
              </ul>
              {isAdmin ? (
                <>
                  <p className="mt-4 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Administration
                  </p>
                  <ul className="mt-1 space-y-1">
                    {ADMIN.map((l) => (
                      <MobileItem key={l.to} link={l} active={active(l.to)} />
                    ))}
                  </ul>
                </>
              ) : null}
              <div className="mt-4 border-t border-border pt-3">
                <ul className="space-y-1">
                  <MobileItem
                    link={{ to: "/settings", label: "Account Settings", icon: Wrench }}
                    active={active("/settings")}
                  />
                </ul>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <LogOut className="size-4" aria-hidden /> Log Out
                </button>
              </div>
            </nav>
          </>
        ) : null}
      </header>
    </TooltipProvider>
  );
}

function TopLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      to={link.to}
      aria-current={active ? "page" : undefined}
      className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {link.label}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-primary"
        />
      ) : null}
    </Link>
  );
}

function MobileItem({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <li>
      <Link
        to={link.to}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
          active
            ? "border border-primary/40 bg-secondary text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <link.icon className={`size-4 shrink-0 ${active ? "text-brand" : ""}`} aria-hidden />
        <span className="min-w-0 truncate">{link.label}</span>
      </Link>
    </li>
  );
}
