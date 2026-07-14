// Shared Firecrawl web-search/scrape helpers used across jurisdiction sync, jurisdiction
// profiles, permit lookup, and plan review server functions.

export type FirecrawlSearchResult = { url: string; title?: string; description?: string };

export async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function firecrawlSearch(apiKey: string, query: string, limit = 5): Promise<FirecrawlSearchResult[]> {
  const resp = await fetchWithTimeout("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit }),
  }, 20000);
  if (!resp.ok) throw new Error(`Firecrawl search failed [${resp.status}]: ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { data?: { web?: FirecrawlSearchResult[] } | FirecrawlSearchResult[] };
  const raw = Array.isArray(j.data) ? j.data : j.data?.web ?? [];
  return raw.filter((r) => r?.url);
}

export async function firecrawlScrape(apiKey: string, url: string): Promise<{ markdown: string; title: string }> {
  const resp = await fetchWithTimeout("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 15000 }),
  }, 20000);
  if (!resp.ok) throw new Error(`Firecrawl scrape failed [${resp.status}]: ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { data?: { markdown?: string; metadata?: { title?: string } } };
  return { markdown: j.data?.markdown ?? "", title: j.data?.metadata?.title ?? "" };
}
