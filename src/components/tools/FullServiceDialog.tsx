import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { requestFullService } from "@/lib/toolsReports.functions";
import type { ProjectLite } from "@/lib/toolsCatalog";

/** "Have Permivio handle this project" — creates a service request on the project. */
export function FullServiceDialog({ project, onClose }: { project: ProjectLite | null; onClose: () => void }) {
  const submitFn = useServerFn(requestFullService);
  const [contact, setContact] = useState("email");
  const [contactValue, setContactValue] = useState("");
  const [timeline, setTimeline] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitFn({
        data: {
          projectId: project?.id ?? null,
          preferredContact: contact,
          contactValue,
          desiredTimeline: timeline,
          notes,
        },
      });
      setDone(true);
    } catch {
      setError("We couldn't send that request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Have Permivio handle this project</h2>
          <button onClick={onClose} aria-label="Close request" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {done ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-foreground">Thank you — your request has been sent.</p>
            <p className="text-sm text-muted-foreground">
              Everything already on this project — address, jurisdiction research, project type, scope, documents and
              reports — carries forward. You won't need to re-enter any of it.
            </p>
            <button onClick={onClose} className="mt-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Want us to take it from here? Permivio can manage the permitting process for you
              {project ? ` on ${project.name}` : ""}.
            </p>
            <div className="mt-5 space-y-4">
              <Field label="Preferred contact method">
                <select
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="text">Text message</option>
                </select>
              </Field>
              <Field label="Where should we reach you?">
                <input
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Desired timeline">
                <input
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  placeholder="e.g. open by early spring"
                  className="h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Anything else we should know?">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-input bg-background/60 p-3 text-sm outline-none focus:border-primary"
                />
              </Field>
            </div>
            {error && <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground">{error}</p>}
            <button
              onClick={submit}
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Send request
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
