import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Transient auth failures caused by small clock skew between the browser,
 * the auth service and the server ("JWT issued at future" / "not yet valid")
 * resolve themselves within a second or two, so retry those instead of
 * surfacing an error screen.
 */
function isClockSkewAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /issued at future|not yet valid|iat|nbf/i.test(message);
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          isClockSkewAuthError(error) ? failureCount < 4 : failureCount < 1,
        retryDelay: (failureCount) => Math.min(1000 * 2 ** failureCount, 4000),
      },
    },
  });


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
