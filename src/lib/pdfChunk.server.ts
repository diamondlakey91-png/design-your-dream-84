// Server-only helper: split a large plan-set PDF into page-range chunks so a
// single oversized upload can still be read by the AI review passes. pdf-lib is
// pure JS, so it runs inside the Worker runtime.
import { PDFDocument } from "pdf-lib";

export const MAX_PAGES_PER_CALL = 30;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type PdfChunk = { label: string; pages: number; firstPage: number; lastPage: number; base64: string };

/**
 * Returns one chunk per page range. A PDF at or under `pagesPerChunk` pages
 * comes back as a single chunk containing the original bytes.
 */
export async function splitPdfIntoChunks(
  bytes: Uint8Array,
  name: string,
  pagesPerChunk: number = MAX_PAGES_PER_CALL,
): Promise<PdfChunk[]> {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    // Unreadable structure (or encrypted beyond repair): hand the raw file over.
    return [{ label: name, pages: 0, firstPage: 1, lastPage: 1, base64: toBase64(bytes) }];
  }
  const total = src.getPageCount();
  if (total <= pagesPerChunk) {
    return [{ label: name, pages: total, firstPage: 1, lastPage: total, base64: toBase64(bytes) }];
  }

  const chunks: PdfChunk[] = [];
  for (let start = 0; start < total; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, total);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i));
    for (const p of copied) out.addPage(p);
    const outBytes = await out.save({ useObjectStreams: true });
    chunks.push({
      label: `${name} (pages ${start + 1}-${end} of ${total})`,
      pages: end - start,
      firstPage: start + 1,
      lastPage: end,
      base64: toBase64(new Uint8Array(outBytes)),
    });
  }
  return chunks;
}
