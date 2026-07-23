import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Save, Sparkles, CheckCircle2, HelpCircle, ClipboardList, Wrench } from "lucide-react";
import { getScope } from "@/lib/scope.functions";
import {
  saveIntakeHeader,
  saveIntakeAnswer,
  getIntakeAnswers,
  finalizeIntake,
} from "@/lib/intake.functions";
import { generateRoadmapFromRules } from "@/lib/roadmap.functions";
import {
  FRIENDLY_PROJECT_TYPES,
  type FriendlyProjectType,
} from "@/lib/projectTypeMap";
import {
  pickQuestions,
  type AnswerChoice,
  type Question,
} from "@/lib/intakeQuestions";
import { intakeStatusLabel } from "@/lib/statusLabels";
import { JurisdictionConfirmCard } from "./JurisdictionConfirmCard";

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: "Address",
  2: "Jurisdiction",
  3: "Project type",
  4: "Describe the work",
  5: "A few questions",
};

export function IntakeWizard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getScopeFn = useServerFn(getScope);
  const saveHeaderFn = useServerFn(saveIntakeHeader);
  const saveAnswerFn = useServerFn(saveIntakeAnswer);
  const getAnswersFn = useServerFn(getIntakeAnswers);
  const finalizeFn = useServerFn(finalizeIntake);
  const genRoadmapFn = useServerFn(generateRoadmapFromRules);

  const scopeQ = useQuery({
    queryKey: ["scope", projectId],
    queryFn: () => getScopeFn({ data: { project_id: projectId } }),
  });
  const answersQ = useQuery({
    queryKey: ["intake-answers", projectId],
    queryFn: () => getAnswersFn({ data: { project_id: projectId } }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = scopeQ.data?.scope as any;

  const [step, setStep] = useState<Step>(1);
  const [friendly, setFriendly] = useState<FriendlyProjectType | "">("");
  const [plainScope, setPlainScope] = useState("");
  const [localAnswers, setLocalAnswers] = useState<Record<string, AnswerChoice | string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hydrate once from server data
  useEffect(() => {
    if (hydrated || !scope) return;
    setFriendly((scope.friendly_project_type ?? "") as FriendlyProjectType | "");
    setPlainScope(scope.plain_scope ?? scope.scope_text ?? "");
    const savedStep = Math.min(5, Math.max(1, Number(scope.intake_step ?? 1))) as Step;
    setStep(savedStep);
    setHydrated(true);
  }, [scope, hydrated]);

  useEffect(() => {
    if (!answersQ.data) return;
    const a: Record<string, AnswerChoice | string> = {};
    for (const r of answersQ.data.answers) {
      if (r.answer_choice) a[r.question_key] = r.answer_choice as AnswerChoice;
      else if (r.answer_value) a[r.question_key] = r.answer_value;
    }
    setLocalAnswers((prev) => ({ ...a, ...prev }));
  }, [answersQ.data]);

  const questions = useMemo<Question[]>(
    () => pickQuestions({ friendly: (friendly || null) as FriendlyProjectType | null, scopeText: plainScope, answers: localAnswers }),
    [friendly, plainScope, localAnswers],
  );

  const isConfirmed = false; // JurisdictionConfirmCard handles its own state; step 2 gating is by the user's Confirm button, we don't need to inspect it here to advance.

  // ---------- persistence helpers ----------
  const persistHeader = async (patch: {
    friendly_project_type?: FriendlyProjectType;
    plain_scope?: string;
    intake_step?: number;
    intake_status?: "draft" | "questions" | "ready";
  }) => {
    await saveHeaderFn({ data: { project_id: projectId, ...patch } });
    qc.invalidateQueries({ queryKey: ["scope", projectId] });
  };

  const persistAnswer = async (key: string, val: AnswerChoice | string) => {
    setLocalAnswers((a) => ({ ...a, [key]: val }));
    const isChoice = ["yes", "no", "unsure", "later"].includes(val);
    await saveAnswerFn({
      data: {
        project_id: projectId,
        question_key: key,
        answer_choice: isChoice ? (val as AnswerChoice) : null,
        answer_value: !isChoice ? String(val) : null,
      },
    });
    qc.invalidateQueries({ queryKey: ["intake-answers", projectId] });
  };

  // ---------- navigation ----------
  const goto = async (next: Step) => {
    setBusy(true);
    try {
      await persistHeader({
        intake_step: next,
        intake_status: next < 5 ? "questions" : "questions",
        friendly_project_type: (friendly || undefined) as FriendlyProjectType | undefined,
        plain_scope: plainScope || undefined,
      });
      setStep(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await persistHeader({
        friendly_project_type: (friendly || undefined) as FriendlyProjectType | undefined,
        plain_scope: plainScope || undefined,
        intake_step: 5,
        intake_status: "ready",
      });
      await finalizeFn({ data: { project_id: projectId } });
      await genRoadmapFn({ data: { project_id: projectId } });
      await persistHeader({ intake_status: "ready" });
      toast.success("Roadmap generated");
      qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
      qc.invalidateQueries({ queryKey: ["scope", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 1 && !!scope) ||
    (step === 2) ||
    (step === 3 && !!friendly) ||
    (step === 4 && plainScope.trim().length > 5) ||
    (step === 5);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-mono uppercase tracking-widest text-brand">Project Intake</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Answer a few plain-language questions. Permivio handles the permit research, agencies, and code work.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-muted text-muted-foreground border border-border">
            {intakeStatusLabel(scope?.intake_status)}
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <ol className="flex items-center gap-1 overflow-x-auto">
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <li key={s} className="flex-1 min-w-[100px]">
            <button
              type="button"
              onClick={() => setStep(s)}
              className={`w-full text-left rounded-md border px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-colors ${
                step === s
                  ? "border-brand text-brand bg-brand/10"
                  : "border-border text-muted-foreground hover:border-brand/40"
              }`}
            >
              {String(s).padStart(2, "0")} · {STEP_LABELS[s]}
            </button>
          </li>
        ))}
      </ol>

      {/* Step body */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        {step === 1 && (
          <>
            <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Where is the property?</h3>
            <p className="text-xs text-muted-foreground">
              Enter the full property address below. A ZIP code alone isn't enough — Permivio uses the address to find the exact building, planning, fire, and health authorities for your project.
            </p>
            <JurisdictionConfirmCard projectId={projectId} />
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Confirm your jurisdiction</h3>
            <p className="text-xs text-muted-foreground">
              Review the resolved municipality, county, and reviewing authorities. Confirm them so Permivio can generate a verified roadmap. You can correct the location or request human verification if anything looks wrong.
            </p>
            <JurisdictionConfirmCard projectId={projectId} />
          </>
        )}

        {step === 3 && (
          <>
            <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">What are you planning to do?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {FRIENDLY_PROJECT_TYPES.map((p) => {
                const active = friendly === p.v;
                return (
                  <button
                    type="button"
                    key={p.v}
                    onClick={() => setFriendly(p.v)}
                    className={`text-left rounded-md border p-3 transition-colors ${
                      active
                        ? "border-brand bg-brand/10"
                        : "border-border hover:border-brand/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{p.label}</div>
                      {active && <CheckCircle2 className="size-4 text-brand" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{p.description}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Describe your project</h3>
            <p className="text-xs text-muted-foreground">
              In your own words, what are you doing? You don't need to know construction types, codes, or permit names — just describe the work.
            </p>
            <Textarea
              rows={7}
              value={plainScope}
              onChange={(e) => setPlainScope(e.target.value)}
              placeholder={`Example: We are converting an existing retail space into a restaurant with a commercial kitchen, new walls, plumbing, HVAC, electrical work, exterior signage, and outdoor seating.`}
            />
            <div className="text-[11px] text-muted-foreground">
              You can also upload plans on the Documents tab once your intake is submitted — Permivio will extract details automatically.
            </div>
          </>
        )}

        {step === 5 && (
          <FollowupsStep
            questions={questions}
            answers={localAnswers}
            onAnswer={persistAnswer}
          />
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStep((s) => (Math.max(1, s - 1) as Step))}
          disabled={busy || step === 1}
        >
          <ArrowLeft className="size-4 mr-1.5" /> Back
        </Button>

        <div className="flex items-center gap-2">
          {step < 5 && (
            <Button
              size="sm"
              onClick={() => goto((step + 1) as Step)}
              disabled={busy || !canNext}
            >
              {busy ? "Saving…" : "Continue"}
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          )}
          {step === 5 && (
            <Button size="sm" onClick={finish} disabled={busy}>
              <Sparkles className="size-4 mr-1.5" />
              {busy ? "Generating…" : "Generate roadmap"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------- Follow-ups step -------------------
function FollowupsStep({
  questions,
  answers,
  onAnswer,
}: {
  questions: Question[];
  answers: Record<string, AnswerChoice | string>;
  onAnswer: (key: string, value: AnswerChoice | string) => void | Promise<void>;
}) {
  const [expandedWhy, setExpandedWhy] = useState<Record<string, boolean>>({});

  if (questions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No additional questions needed for this scope. You can generate your roadmap.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        <ClipboardList className="size-3.5" /> {questions.length} question{questions.length === 1 ? "" : "s"} left
      </div>
      {questions.map((q) => {
        const cur = answers[q.key];
        return (
          <div key={q.key} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{q.prompt}</div>
                {expandedWhy[q.key] && (
                  <div className="text-[11px] text-muted-foreground mt-1">{q.why}</div>
                )}
              </div>
              <button
                type="button"
                aria-label="Why this matters"
                onClick={() => setExpandedWhy((s) => ({ ...s, [q.key]: !s[q.key] }))}
                className="text-muted-foreground hover:text-brand shrink-0"
              >
                <HelpCircle className="size-4" />
              </button>
            </div>

            {q.kind === "choice" && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(["yes","no","unsure","later"] as AnswerChoice[]).map((c) => {
                  const active = cur === c;
                  const label = c === "later" ? "Ask me later" : c === "unsure" ? "Not sure" : c === "yes" ? "Yes" : "No";
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onAnswer(q.key, c)}
                      className={`text-[11px] font-mono uppercase tracking-widest px-2.5 py-1 rounded border transition-colors ${
                        active
                          ? "border-brand bg-brand/10 text-brand"
                          : "border-border text-muted-foreground hover:border-brand/40"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {q.kind === "date" && (
              <div className="mt-2">
                <Input
                  type="date"
                  value={typeof cur === "string" && cur && !["yes","no","unsure","later"].includes(cur) ? cur : ""}
                  onChange={(e) => onAnswer(q.key, e.target.value)}
                  className="max-w-[220px]"
                />
              </div>
            )}

            {q.kind === "text" && (
              <div className="mt-2">
                <Input
                  value={typeof cur === "string" && !["yes","no","unsure","later"].includes(cur) ? cur : ""}
                  onChange={(e) => onAnswer(q.key, e.target.value)}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="rounded-md border border-border bg-muted/30 p-3 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Wrench className="size-3.5 mt-0.5 shrink-0" />
        <span>
          Pick "Not sure" for anything you don't know — Permivio can extract those details from your plans later. "Ask me later" hides the question until you're ready.
        </span>
      </div>
    </div>
  );
}
