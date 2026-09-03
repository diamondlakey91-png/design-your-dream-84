import { createContext, useContext, type ReactNode } from "react";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { AppNav } from "@/components/AppNav";

/**
 * True when an AppShell (and therefore the single AppNav) is already mounted
 * above us — keeps nested page-level <AppShell> usages from duplicating nav.
 */
const ShellContext = createContext(false);

export function AppShell({ children }: { children: ReactNode }) {
  const alreadyInShell = useContext(ShellContext);
  if (alreadyInShell) return <>{children}</>;

  return (
    <ShellContext.Provider value={true}>
      <div className="relative min-h-dvh bg-background pb-12 text-foreground">
        {/* Ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(60rem 40rem at 15% -10%, oklch(0.66 0.19 258 / 0.12), transparent 60%), radial-gradient(50rem 40rem at 100% 10%, oklch(0.68 0.19 305 / 0.10), transparent 60%)",
          }}
        />
        <AppNav />
        <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8">
          <WelcomeBanner />
        </div>
        <div className="mx-auto max-w-7xl px-0 lg:px-8">{children}</div>
      </div>
    </ShellContext.Provider>
  );
}
