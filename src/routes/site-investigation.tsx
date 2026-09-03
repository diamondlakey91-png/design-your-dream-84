import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Compass,
  Landmark,
  Loader2,
  MapPinCheck,
  ShieldAlert,
} from "lucide-react";
import { PermivioMark } from "@/components/PermivioMark";
import { submitSirRequest } from "@/lib/sir.functions";

export const Route = createFileRoute("/site-investigation")({
  head: () => ({
    meta: [
      { title: "Site Investigation Reports — Permivio" },
      {
        name: "description",
        content:
          "Jurisdiction-specific site investigation and feasibility research: zoning, permit paths, utilities, risks, and go / no-go decision support before you commit.",
      },
      { property: "og:title", content: "Site Investigation Reports — Permivio" },
      {
        property: "og:description",
        content:
          "Know the permitting path before you commit. AHJ identification, zoning research, approval matrices, risk analysis, and due-diligence checklists.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SiteInvestigationPage,
});

const COVERAGE = [
  {
    icon: Landmark,
    title: "Jurisdiction & Land Use",
    items: [
      "Authority Having Jurisdiction (AHJ) identification",
      "Zoning and allowable-use research",
      "Planning and land-use requirements",
      "Setbacks and parking requirements",
      "Entitlement requirements",
      "Site-development requirements",
    ],
  },
  {
    icon: ClipboardList,
    title: "Permit & Approval Path",
    items: [
      "Permit and approval matrix",
      "Building, fire and health review paths",
      "Required pre-application meetings",
      "Agency contact research",
      "Published or agency-confirmed review timelines",
      "Jurisdictional fee research where available",
    ],
  },
  {
    icon: Compass,
    title: "Site & Infrastructure",
    items: [
      "Utility considerations and provider coordination points",
      "Right-of-way considerations",
      "Known site constraints identified in agency records",
      "Approval dependencies and sequencing",
    ],
  },
  {
    icon: ShieldAlert,
    title: "Risk & Decision Support",
    items: [
      "Potential permitting constraints",
      "Outstanding due-diligence items",
      "Project-specific recommendations",
      "Go / no-go decision support",
    ],
  },
];

const ROLES = ["Owner / Developer", "Contractor", "Architect / Engineer", "Broker", "Homeowner", "Other"];
const STAGES = ["Just exploring", "Site under contract", "Site owned", "Design underway", "Ready to permit"];
const REPORT_SPEEDS = ["Standard", "Expedited", "Not sure yet"];

const inputCls =
  "w-full rounded-lg border border-blue-500/20 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none backdrop-blur transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-blue-200/70">
        {label} {required && <span className="text-blue-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function SiteInvestigationPage() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await submitSirRequest({
        data: {
          name: String(fd.get("name") ?? ""),
          company: String(fd.get("company") ?? ""),
          email: String(fd.get("email") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          role: String(fd.get("role") ?? ""),
          projectStage: String(fd.get("projectStage") ?? ""),
          siteAddress: String(fd.get("siteAddress") ?? ""),
          jurisdiction: String(fd.get("jurisdiction") ?? ""),
          parcelApn: String(fd.get("parcelApn") ?? ""),
          approxSize: String(fd.get("approxSize") ?? ""),
          intendedUse: String(fd.get("intendedUse") ?? ""),
          existingBuilding: String(fd.get("existingBuilding") ?? ""),
          reportNeeded: String(fd.get("reportNeeded") ?? ""),
          targetDate: String(fd.get("targetDate") ?? ""),
          notes: String(fd.get("notes") ?? ""),
          website: String(fd.get("website") ?? ""),
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04070f] text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70rem 45rem at 50% -10%, rgba(59,130,246,0.26), transparent 60%), radial-gradient(50rem 40rem at 10% 40%, rgba(37,99,235,0.14), transparent 60%)",
        }}
      />

      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <PermivioMark className="h-8 w-8" />
          <span className="bg-gradient-to-r from-blue-300 via-blue-400 to-blue-600 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            PERMIVIO
          </span>
        </Link>
        <Link
          to="/auth"
          className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-4 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.6)]"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-24">
        {/* Hero */}
        <section className="max-w-3xl pt-10 md:pt-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-blue-400/80">
            Site Investigation Reports
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Know the site before you commit.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            A Site Investigation Report (SIR) maps the permitting and feasibility landscape for your
            project — the agencies involved, the approvals required, and the risks worth knowing
            about — before you close, design, or build.
          </p>
        </section>

        {/* Coverage */}
        <section className="mt-16">
          <h2 className="text-2xl font-semibold text-white">What an SIR can cover</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Scope is tailored to the project and jurisdiction. Typical research categories include:
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {COVERAGE.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-blue-500/15 bg-white/[0.03] p-6 backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
                    <c.icon className="size-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{c.title}</h3>
                </div>
                <ul className="mt-4 space-y-2">
                  {c.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-blue-400/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-slate-500">
            SIR findings are research and decision-support materials. They identify verified
            jurisdictional requirements, agency-published information, and items that may require
            confirmation — they are not legal, architectural, or engineering determinations, and do
            not replace review by the Authority Having Jurisdiction or licensed professionals.
          </p>
        </section>

        {/* Intake */}
        <section id="request" className="mt-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
                <MapPinCheck className="size-6" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-white">
                Request a Site Investigation Report
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Give us the site and the intended use. We'll confirm the research scope, what the
                report will cover for that jurisdiction, and turnaround — no cost for the initial
                consultation.
              </p>
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
                <Building2 className="mt-0.5 size-5 shrink-0 text-blue-300" />
                <p className="text-sm text-slate-300">
                  Already a Permivio client?{" "}
                  <Link to="/auth" className="font-medium text-blue-300 underline underline-offset-4">
                    Sign in
                  </Link>{" "}
                  to run a Site Investigation directly from your project dashboard.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/15 bg-white/[0.03] p-6 backdrop-blur md:p-8">
              {done ? (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="size-12 text-green-400" />
                  <h3 className="mt-4 text-xl font-semibold text-white">Request received</h3>
                  <p className="mt-2 max-w-sm text-sm text-slate-400">
                    Thanks — we'll review the site and intended use, then follow up with the proposed
                    research scope and turnaround.
                  </p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
                  {/* Honeypot */}
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />
                  <Field label="Name" required>
                    <input name="name" required className={inputCls} autoComplete="name" />
                  </Field>
                  <Field label="Company">
                    <input name="company" className={inputCls} autoComplete="organization" />
                  </Field>
                  <Field label="Email" required>
                    <input name="email" type="email" required className={inputCls} autoComplete="email" />
                  </Field>
                  <Field label="Phone">
                    <input name="phone" type="tel" className={inputCls} autoComplete="tel" />
                  </Field>
                  <Field label="I am a">
                    <select name="role" className={inputCls} defaultValue="">
                      <option value="" className="bg-slate-900">Select…</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="bg-slate-900">{r}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Project stage">
                    <select name="projectStage" className={inputCls} defaultValue="">
                      <option value="" className="bg-slate-900">Select…</option>
                      {STAGES.map((s) => (
                        <option key={s} value={s} className="bg-slate-900">{s}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Site address">
                      <input name="siteAddress" className={inputCls} placeholder="Street address (if known)" />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="City / state / county" required>
                      <input name="jurisdiction" required className={inputCls} placeholder="e.g. Arlington County, VA" />
                    </Field>
                  </div>
                  <Field label="Parcel / APN (if known)">
                    <input name="parcelApn" className={inputCls} />
                  </Field>
                  <Field label="Approx. building / site size">
                    <input name="approxSize" className={inputCls} placeholder="e.g. 4,500 SF on 0.8 acres" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Intended use / scope of work" required>
                      <textarea
                        name="intendedUse"
                        required
                        rows={3}
                        className={inputCls}
                        placeholder="e.g. Tenant fit-out of a ground-floor restaurant, new 12-unit townhome development…"
                      />
                    </Field>
                  </div>
                  <Field label="Existing building on site?">
                    <select name="existingBuilding" className={inputCls} defaultValue="">
                      <option value="" className="bg-slate-900">Select…</option>
                      <option value="yes" className="bg-slate-900">Yes</option>
                      <option value="no" className="bg-slate-900">No</option>
                      <option value="unknown" className="bg-slate-900">Not sure</option>
                    </select>
                  </Field>
                  <Field label="Report needed">
                    <select name="reportNeeded" className={inputCls} defaultValue="">
                      <option value="" className="bg-slate-900">Select…</option>
                      {REPORT_SPEEDS.map((r) => (
                        <option key={r} value={r} className="bg-slate-900">{r}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Target opening / milestone date">
                    <input name="targetDate" className={inputCls} placeholder="e.g. Q2 2027" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Anything else we should research">
                      <textarea name="notes" rows={3} className={inputCls} />
                    </Field>
                  </div>
                  {error && (
                    <p className="sm:col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {error}
                    </p>
                  )}
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.6)] transition hover:shadow-[0_10px_40px_-4px_rgba(59,130,246,0.8)] disabled:opacity-60"
                    >
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                      {pending ? "Submitting…" : "Request your report"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-blue-500/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-10 font-mono text-[11px] uppercase tracking-[0.25em] text-blue-300/90">
          <div className="flex items-center gap-2.5">
            <PermivioMark className="h-5 w-5" />
            <span>© Permivio</span>
          </div>
          <span>Intelligent Permitting.</span>
        </div>
      </footer>
    </div>
  );
}
