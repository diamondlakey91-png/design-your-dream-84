// Client-safe shim: server metering (aiMeter.server) installs a hook that records
// AI Gateway token usage; without it this is plain fetch.
type F = (input: string, init?: RequestInit) => Promise<Response>;
export const aiFetch: F = (input, init) => {
  const hook = (globalThis as { __permivioAiFetch?: F }).__permivioAiFetch;
  return hook ? hook(input, init) : fetch(input, init);
};
