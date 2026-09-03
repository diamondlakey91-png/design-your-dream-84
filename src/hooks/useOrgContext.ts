import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgContext, type OrgContext } from "@/lib/org.functions";

/**
 * Role-based experience resolution. Clients get the simplified view; permitting
 * professionals, reviewers and platform admins get the full workspace.
 */
export function useOrgContext() {
  const fn = useServerFn(getOrgContext);
  return useQuery<OrgContext>({
    queryKey: ["org-context"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
}
