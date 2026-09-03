import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Loader2,
  MapPinCheck,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { PermivioMark } from "@/components/PermivioMark";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Permivio Demo — See the Permitting Path End to End" },
      {
        name: "description",
        content:
          "Watch how Permivio turns a property and a project description into a feasibility read, permit roadmap, plan review, correction plan, and a clear path to Certificate of Occupancy.",
      },
      { property: "og:title", content: "Permivio Demo — See the Permitting Path End to End" },
      {
        property: "og:description",
        content:
          "A short walkthrough: enter a property, describe the project, and see the permits, documents, risks, and next steps Permivio organizes for you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoPage,
});

/**
 * Every value shown in this walkthrough is illustrative sample content for a
 * fictional project. It is not client data and not a jurisdiction determination.
 */
const SCENE_MS = 9000;

type Scene = {
  key: string;
  eyebrow: string;
  title: string;
  caption: string;
  body: () => React.ReactNode;
};

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-blue-500/15 bg-gradient-to-b from-white/[0.05] to-white/[0.01] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-blue-500/10 px-4 py-2.5">
        <PermivioMark className="h-4 w-4" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-blue-300/80">{label}</span>
        <span className="ml-auto rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200">
          Sample project
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}

function Label({ kind }: { kind: "verified" | "ai" | "confirm" }) {
  const map = {
    verified: { t: "Verified", c: "border-green-500/30 bg-green-500/10 text-green-300" },
    ai: { t: "AI-assisted", c: "border-blue-500/30 bg-blue-500/10 text-blue-200" },
    confirm: { t: "Needs confirmation", c: "border-slate-500/30 bg-white/5 text-slate-300" },
  }[kind];
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${map.c}`}>{map.t}</span>;
}

function ProgressChecks({ items }: { items: string[] }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= items.length ? v : v + 1)), 950);
    return () => clearInterval(id);
  }, [items.length]);
  return (
    <ul className="grid gap-2">
      {items.map((it, i) => (
        <li
          key={it}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-500 ${
            i < n ? "border-green-500/25 bg-green-500/[0.06] text-white" : "border-white/10 bg-white/[0.02] text-slate-400"
          }`}
        >
          {i < n ? (
            <CheckCircle2 className="size-4 shrink-0 text-green-400" />
          ) : (
            <Loader2 className={`size-4 shrink-0 ${i === n ? "animate-spin text-blue-400" : "text-slate-600"}`} />
          )}
          {it}
        </li>
      ))}
    </ul>
  );
}

const LIFECYCLE = [
  "Site Investigation",
  "Permit Roadmap",
  "Plans",
  "QA/QC",
  "Submission",
  "Corrections",
  "Permit Issued",
  "Inspections",
  "Certificate of Occupancy",
];

const SCENES: Scene[] = [
  {
    key: "intake",
    eyebrow: "Scene 1",
    title: "Tell us about your project",
    caption: "Start with the property and tell us what you want to do.",
    body: () => (
      <Panel label="Project intake">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Property" value="1420 Main Street" />
          <Field label="Project type" value="Restaurant Tenant Improvement" />
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Scope of work</p>
          <p className="mt-1 text-sm text-slate-200">
            “We are converting an existing retail space into a restaurant with a commercial kitchen.”
          </p>
        </div>
      </Panel>
    ),
  },
  {
    key: "investigate",
    eyebrow: "Scene 2",
    title: "Permivio investigates",
    caption: "Permivio researches the permitting path behind the scenes.",
    body: () => (
      <Panel label="Site investigation in progress">
        <ProgressChecks
          items={[
            "Confirming property",
            "Identifying jurisdiction",
            "Reviewing zoning",
            "Researching permit requirements",
            "Reviewing utilities",
            "Analyzing risks",
          ]}
        />
      </Panel>
    ),
  },
  {
    key: "feasibility",
    eyebrow: "Scene 3",
    title: "Project feasibility",
    caption: "See important issues before they become expensive surprises.",
    body: () => (
      <Panel label="Feasibility snapshot">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-200">
            Feasible with conditions
          </span>
          <Label kind="ai" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Likely approvals" value="7 identified" />
          <Field label="Requires confirmation" value="1 major item" />
          <Field label="Primary risk" value="Sewer capacity confirmation" />
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Illustrative output. Utility capacity is never confirmed without written availability from the provider.
        </p>
      </Panel>
    ),
  },
  {
    key: "roadmap",
    eyebrow: "Scene 4",
    title: "Permit roadmap",
    caption: "Know what approvals are likely needed and what happens first.",
    body: () => (
      <Panel label="Permit roadmap">
        <div className="flex flex-wrap gap-2">
          {["Building Permit", "Health Review", "Fire Review", "Electrical", "Mechanical", "Plumbing", "Signage"].map(
            (p, i) => (
              <span
                key={p}
                className="rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-3 py-1.5 text-sm text-blue-100"
                style={{ animation: `fadeUp .5s ease ${i * 0.12}s both` }}
              >
                {p}
              </span>
            ),
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Approvals identified" value="7" />
          <Field label="Documents still needed" value="3" />
          <Field label="Sequence" value="Estimated sequence created" />
        </div>
      </Panel>
    ),
  },
  {
    key: "qaqc",
    eyebrow: "Scene 5",
    title: "Plan QA/QC",
    caption: "Review plans before submission and identify possible issues early.",
    body: () => (
      <Panel label="Plan QA/QC">
        <div className="rounded-xl border border-dashed border-blue-500/30 bg-blue-500/[0.04] px-4 py-5 text-center text-sm text-blue-100">
          <FileSearch className="mx-auto size-5 text-blue-300" />
          <p className="mt-2">A2.1_Architectural_Set.pdf · uploading</p>
          <div className="mx-auto mt-3 h-1.5 w-2/3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-700" style={{ animation: "grow 3s ease-out both" }} />
          </div>
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-blue-300/80">Plan QA/QC complete</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="High priority findings" value="2" />
          <Field label="Coordination items" value="6" />
          <Field label="Missing documents" value="3" />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Findings are AI-identified potential issues, not confirmed code violations.
        </p>
      </Panel>
    ),
  },
  {
    key: "corrections",
    eyebrow: "Scene 6",
    title: "Corrections",
    caption: "Turn review comments into an organized correction plan.",
    body: () => (
      <Panel label="Correction matrix">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          “Provide clear width dimension at required exit door and revise door hardware note.”
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="Comment" value="03" />
          <Field label="Responsible" value="Architect" />
          <Field label="Sheet" value="A2.1" />
          <Field label="Status" value="Open" />
        </div>
      </Panel>
    ),
  },
  {
    key: "dashboard",
    eyebrow: "Scene 7",
    title: "Client dashboard",
    caption: "Always know where your project stands.",
    body: () => (
      <Panel label="Client dashboard">
        <h3 className="text-xl font-semibold text-white">Good morning, Sarah</h3>
        <p className="mt-1 text-sm text-slate-400">Here's what's happening with your projects.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-slate-200">3 active projects</span>
          <span className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-blue-200">1 needs your attention</span>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">Main Street Restaurant</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Current status" value="Jurisdiction review" />
            <Field label="Next step" value="Waiting for initial review" />
          </div>
          <p className="mt-3 text-sm text-slate-400">No action needed from you right now.</p>
        </div>
      </Panel>
    ),
  },
  {
    key: "path",
    eyebrow: "Scene 8",
    title: "From property to approval",
    caption: "Permivio keeps the permitting path organized.",
    body: () => (
      <Panel label="Project completion path">
        <ol className="grid gap-2">
          {LIFECYCLE.map((s, i) => (
            <li
              key={s}
              className="flex items-center gap-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-4 py-2.5 text-sm text-blue-50"
              style={{ animation: `fadeUp .45s ease ${i * 0.1}s both` }}
            >
              <span className="font-mono text-[11px] text-blue-400/70">0{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </Panel>
    ),
  },
];

function DemoPage() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const scene = SCENES[i]!;
  const last = i === SCENES.length - 1;

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setI((v) => (v >= SCENES.length - 1 ? v : v + 1)), SCENE_MS);
    return () => clearTimeout(id);
  }, [i, playing]);

  useEffect(() => {
    if (last) setPlaying(false);
  }, [last]);

  const replay = useCallback(() => {
    setI(0);
    setPlaying(true);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);

  const progress = useMemo(() => ((i + 1) / SCENES.length) * 100, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, SCENES.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04070f] text-foreground">
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes grow { from { width: 8%; } to { width: 100%; } }
      `}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70rem 45rem at 50% -10%, rgba(59,130,246,0.24), transparent 60%), radial-gradient(50rem 40rem at 100% 20%, rgba(139,92,246,0.12), transparent 60%)",
        }}
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <PermivioMark className="h-8 w-8" />
          <span className="bg-gradient-to-r from-blue-300 via-blue-400 to-blue-600 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            PERMIVIO
          </span>
        </Link>
        <Link
          to="/"
          aria-label="Close demo"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-500/30 bg-white/5 px-4 text-sm font-medium text-blue-100 backdrop-blur transition hover:bg-white/10"
        >
          <X className="size-4" /> Close
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-blue-400/80">Product demo</p>
          <h1 className="mt-3 bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            From property research to permit approval.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-base text-blue-200/70">
            A short walkthrough of a sample restaurant conversion — no sign-up needed.
          </p>
        </div>

        {/* Scene stage */}
        <div className="mt-10 rounded-3xl border border-blue-500/15 bg-white/[0.02] p-5 backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-blue-400/80">{scene.eyebrow}</p>
              <h2 className="mt-1 text-xl font-semibold text-white md:text-2xl">{scene.title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setI((v) => Math.max(v - 1, 0))}
                disabled={i === 0}
                aria-label="Previous scene"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-200 transition hover:border-blue-500/40 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pause demo" : "Play demo"}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-4 text-sm font-semibold text-white"
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                {playing ? "Pause" : "Play"}
              </button>
              <button
                onClick={() => setI((v) => Math.min(v + 1, SCENES.length - 1))}
                disabled={last}
                aria-label="Next scene"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-200 transition hover:border-blue-500/40 disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
              <button
                onClick={replay}
                aria-label="Replay demo"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-200 transition hover:border-blue-500/40"
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-200 transition hover:border-blue-500/40"
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-700 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div key={scene.key} className="mt-6" style={{ animation: "fadeUp .5s ease both" }}>
            {scene.body()}
            <p className="mt-4 text-center text-sm text-blue-200/80">{scene.caption}</p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-1.5">
            {SCENES.map((s, idx) => (
              <button
                key={s.key}
                onClick={() => setI(idx)}
                aria-label={`Go to ${s.title}`}
                aria-current={idx === i}
                className={`h-1.5 w-8 rounded-full transition ${idx === i ? "bg-blue-400" : "bg-white/15 hover:bg-white/30"}`}
              />
            ))}
          </div>
        </div>

        {/* Video container — drop-in MP4 slot */}
        <DemoVideo videoRef={videoRef} muted={muted} />

        {/* Closing CTAs */}
        <div className="mt-12 rounded-3xl border border-blue-500/15 bg-white/[0.02] p-8 text-center backdrop-blur">
          <h2 className="bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent md:text-3xl">
            From property to approval.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-blue-200/70">
            Permivio keeps the permitting path organized.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.6)]"
            >
              Start a project <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/site-investigation"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-blue-500/30 bg-white/5 px-6 text-sm font-medium text-blue-100 backdrop-blur transition hover:bg-white/10"
            >
              <MapPinCheck className="size-4" /> Run a site investigation
            </Link>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-xs text-slate-500">
            All figures, comments, and project details in this walkthrough are illustrative sample content for a
            fictional project. Permivio labels real project findings as verified, AI-assisted, or needing agency
            confirmation, and never presents analysis as a jurisdiction determination.
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * Video slot for the polished product-demo MP4.
 *
 * To swap in a final asset:
 *   1. Place the file at `public/demo/permivio-demo.mp4`
 *      (optional poster: `public/demo/permivio-demo-poster.jpg`).
 *   2. Recommended encode: 1920x1080, 16:9, H.264 High profile, 30fps,
 *      ~6-8 Mbps, AAC audio, 45-75 seconds, under ~25 MB.
 *   3. No other code change is required — this component detects the file and
 *      renders native controls in place of the fallback below.
 */
function DemoVideo({ videoRef, muted }: { videoRef: React.RefObject<HTMLVideoElement | null>; muted: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/demo/permivio-demo.mp4", { method: "HEAD" })
      .then((r) => alive && setAvailable(r.ok))
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="mt-12">
      <div className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-blue-400/80">Recorded walkthrough</p>
        <h2 className="mt-3 bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent md:text-3xl">
          Prefer to watch it?
        </h2>
      </div>
      <div className="mx-auto mt-6 max-w-4xl overflow-hidden rounded-2xl border border-blue-500/15 bg-white/[0.02] backdrop-blur">
        {available ? (
          <video
            ref={videoRef}
            className="aspect-video w-full"
            controls
            playsInline
            preload="metadata"
            muted={muted}
            poster="/demo/permivio-demo-poster.jpg"
          >
            <source src="/demo/permivio-demo.mp4" type="video/mp4" />
            Your browser does not support embedded video.
          </video>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/25 to-blue-700/10 text-blue-300 ring-1 ring-blue-500/40">
              <Play className="size-5" />
            </div>
            <p className="text-sm font-semibold text-white">Recorded video coming soon</p>
            <p className="max-w-md text-sm text-slate-400">
              The interactive walkthrough above covers the full path. A recorded 45–75 second version will play here
              once the final MP4 is added.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
