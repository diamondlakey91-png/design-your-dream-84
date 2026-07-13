import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/portals.functions";

export function useIsAdmin() {
  const fn = useServerFn(checkIsAdmin);
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => (await fn()).isAdmin,
    staleTime: 5 * 60_000,
  });
}
