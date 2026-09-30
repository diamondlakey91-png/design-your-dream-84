// Server-only: download and read an official PDF (pure-JS pdf.js build that runs in the Worker).
import { isScanned } from "./officialDocs";

export const MAX_DOC_BYTES = 12 * 1024 * 1024;
export const MAX_DOC_PAGES = 80;

export type ReadDoc = { ok: boolean; pages: string[]; title: string | null; scanned: boolean; bytes: number; error: string | null; totalPages: number };

export async function readOfficialPdf(url: string): Promise<ReadDoc> {
  const fail = (error: string, bytes = 0): ReadDoc => ({ ok: false, pages: [], title: null, scanned: false, bytes, error, totalPages: 0 });
  let buf: Uint8Array;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Permivio/1.0)" }, signal: AbortSignal.timeout(25000), redirect: "follow" });
    if (!res.ok) return fail(`HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_DOC_BYTES) return fail("document too large", len);
    buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_DOC_BYTES) return fail("document too large", buf.byteLength);
    if (String.fromCharCode(...buf.subarray(0, 5)) !== "%PDF-") return fail("not a PDF", buf.byteLength);
  } catch (e) { return fail((e as Error).message); }
  try {
    const { getDocumentProxy, extractText, getMeta } = await import("unpdf");
    const size = buf.byteLength;
    const pdf = await getDocumentProxy(buf);
    const total = pdf.numPages;
    let title: string | null = null;
    try { const m = await getMeta(pdf); title = ((m.info as { Title?: string })?.Title ?? "").trim() || null; } catch { /* no metadata */ }
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (text as string[]).slice(0, MAX_DOC_PAGES);
    return { ok: true, pages, title, scanned: isScanned(pages), bytes: size, error: null, totalPages: total };
  } catch (e) { return fail(`unreadable: ${(e as Error).message}`.slice(0, 160), buf.byteLength); }
}
