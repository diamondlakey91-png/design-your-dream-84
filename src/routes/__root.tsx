import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          ERR_404 / ROUTE_UNKNOWN
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">Off the site map.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for isn't on file.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground"
        >
          Back to base
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          ERR_500 / UNEXPECTED
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Something jammed up.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Try again, or head back to the dashboard.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-5 text-sm font-medium"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Permivio — Permit intelligence for contractors" },
      { name: "description", content: "Permivio is a field-tested permit management tool for residential and commercial contractors. Track applications, deadlines, and AI-guided permit requirements from one place." },
      { name: "author", content: "Permivio" },
      { property: "og:title", content: "Permivio — Permit intelligence for contractors" },
      { property: "og:description", content: "Permivio is a field-tested permit management tool for residential and commercial contractors. Track applications, deadlines, and AI-guided permit requirements from one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Permivio — Permit intelligence for contractors" },
      { name: "twitter:description", content: "Permivio is a field-tested permit management tool for residential and commercial contractors. Track applications, deadlines, and AI-guided permit requirements from one place." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/o5aZWAKVa1RvSD6Nis9T0nlVDU82/social-images/social-1783967487341-ChatGPT_Image_Jul_13,_2026,_02_31_18_PM.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/o5aZWAKVa1RvSD6Nis9T0nlVDU82/social-images/social-1783967487341-ChatGPT_Image_Jul_13,_2026,_02_31_18_PM.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
