import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { listProjectTypes, type ProjectTypeDTO } from "@/lib/projectTypes.functions";

const RECENT_KEY = "permivio.projectTypes.recent";

export function useProjectTypes() {
  const fn = useServerFn(listProjectTypes);
  const q = useQuery({
    queryKey: ["project-types-catalog"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
  const byId = useMemo(() => {
    const map = new Map<string, ProjectTypeDTO>();
    for (const t of q.data?.types ?? []) map.set(t.id, t);
    return map;
  }, [q.data]);
  const byInternal = useMemo(() => {
    const map = new Map<string, ProjectTypeDTO>();
    for (const t of q.data?.types ?? []) map.set(t.internal_name, t);
    return map;
  }, [q.data]);
  return {
    ...q,
    categories: q.data?.categories ?? [],
    types: q.data?.types ?? [],
    byId,
    byInternal,
  };
}

export function rememberRecentProjectType(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...list.filter((x) => x !== id)].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function getRecentProjectTypes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
