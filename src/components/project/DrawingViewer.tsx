import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getReviewDrawingUrl } from "@/lib/planReviewWorkspace.functions";
import type { Bbox } from "@/lib/planReviewUx";

type Marker = { id: string; no: number; severity: string; box: Bbox };

/**
 * Renders one page of a reviewed drawing (PDF via pdf.js, or an image) and overlays
 * APPROXIMATE finding markers. pdf.js is loaded only in the browser after mount.
 */
export function DrawingViewer({
  reviewId, documentId, page, onPage, markers, activeId, onMarker,
}: {
  reviewId: string;
  documentId: string | null;
  page: number;
  onPage: (p: number) => void;
  markers: Marker[];
  activeId: string | null;
  onMarker: (id: string) => void;
}) {
  const urlFn = useServerFn(getReviewDrawingUrl);
  const link = useQuery({
    queryKey: ["review-drawing", reviewId, documentId],
    queryFn: () => urlFn({ data: { review_id: reviewId, document_id: documentId as string } }),
    enabled: !!documentId,
    staleTime: 8 * 60 * 1000,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pages, setPages] = useState(1);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docRef = useRef<{ url: string; pdf: any } | null>(null);
  const isImage = (link.data?.mime_type ?? "").startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    const url = link.data?.url;
    if (!url || isImage) return;
    (async () => {
      setState("loading");
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        if (docRef.current?.url !== url) docRef.current = { url, pdf: await pdfjs.getDocument(url).promise };
        const pdf = docRef.current.pdf;
        if (cancelled) return;
        setPages(pdf.numPages);
        const pg = await pdf.getPage(Math.min(Math.max(page, 1), pdf.numPages));
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const base = pg.getViewport({ scale: 1 });
        const scale = Math.min(2, 1600 / base.width);
        const vp = pg.getViewport({ scale });
        canvas.width = vp.width;
        canvas.height = vp.height;
        await pg.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [link.data?.url, isImage, page]);

  if (!documentId) {
    return <div className="flex h-72 items-center justify-center rounded-xl border border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">Select a sheet or finding to open its drawing.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{link.data?.name ?? "Loading drawing…"}</span>
        {!isImage && (
          <span className="flex shrink-0 items-center gap-1">
            <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border border-border p-1 disabled:opacity-40"><ChevronLeft className="size-3.5" /></button>
            Page {page} / {pages}
            <button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded border border-border p-1 disabled:opacity-40"><ChevronRight className="size-3.5" /></button>
          </span>
        )}
      </div>
      <div className="relative overflow-auto rounded-xl border border-border bg-muted/20">
        <div className="relative inline-block min-w-full">
          {isImage && link.data ? (
            <img src={link.data.url} alt={link.data.name} className="block w-full" onLoad={() => setState("ready")} />
          ) : (
            <canvas ref={canvasRef} className="block h-auto w-full" />
          )}
          {state === "ready" && markers.map((m) => (
            <button
              key={m.id}
              onClick={() => onMarker(m.id)}
              aria-label={`Finding ${m.no} (approximate location)`}
              title={`Finding #${m.no} — approximate location`}
              className={`absolute rounded-sm border-2 border-dashed transition ${m.id === activeId ? "border-brand bg-brand/15 ring-2 ring-brand/40" : m.severity === "critical" ? "border-destructive/80 bg-destructive/10" : "border-sky-400/80 bg-sky-400/10"}`}
              style={{ left: `${m.box.x * 100}%`, top: `${m.box.y * 100}%`, width: `${m.box.w * 100}%`, height: `${m.box.h * 100}%` }}
            >
              <span className="absolute -left-2 -top-2 rounded-full bg-brand px-1.5 text-[10px] font-mono text-brand-foreground">{m.no}</span>
            </button>
          ))}
        </div>
        {(state === "loading" || link.isLoading) && <p className="p-4 text-xs text-muted-foreground">Rendering drawing…</p>}
        {(state === "error" || link.isError) && <p className="p-4 text-xs text-destructive">This drawing could not be displayed here.</p>}
      </div>
      <p className="text-[10px] text-muted-foreground">Markers are approximate AI-identified regions, not exact locations.</p>
    </div>
  );
}
