// Browser-only Google Maps JS API loader (shared across map components).
// Loads asynchronously with a callback, per Google's loading=async guidance.

type Win = typeof window & {
  google?: unknown;
  __permivioInitMap?: () => void;
  __permivioMapReady?: boolean;
};

export function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Maps can only load in the browser"));
    const w = window as Win;
    if (w.__permivioMapReady) return resolve();
    if (document.getElementById("permivio-gmaps")) {
      const check = () => (w.__permivioMapReady ? resolve() : setTimeout(check, 60));
      check();
      return;
    }
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
    const channel = (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined) ?? "";
    if (!key) return reject(new Error("Google Maps browser key is not configured"));
    w.__permivioInitMap = () => {
      w.__permivioMapReady = true;
      resolve();
    };
    const s = document.createElement("script");
    s.id = "permivio-gmaps";
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__permivioInitMap${channel ? `&channel=${channel}` : ""}`;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
}
