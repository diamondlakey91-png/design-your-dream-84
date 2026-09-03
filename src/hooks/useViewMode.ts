import { useCallback, useEffect, useState } from "react";

export type ViewMode = "client" | "pro";

const KEY = "permivio.viewMode";

/**
 * Simple (client) vs Professional view preference.
 * Client view is the default; professional tooling is never removed, just
 * kept one click away.
 */
export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>("client");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "client" || saved === "pro") setMode(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const update = useCallback((next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return { mode, setMode: update };
}
