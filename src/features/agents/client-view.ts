// PERMIVIO agent framework — client-safe projection.
//
// Clients never receive internal reasoning, prompts, model names, token counts,
// execution errors, cost data or internal notes. This module is the single place
// that decides what leaves the server for a client audience.

import { CLIENT_PROGRESS_STAGES, CLIENT_STAGE_LABELS, VERIFICATION_LABELS } from "./types";
import type { RunStatus, TaskStatus, VerificationStatus } from "./types";

export type ClientFinding = {
  title: string;
  finding: string;
  explanation: string;
  status_label: string;
  agency: string | null;
  risk_level: string;
  recommendation: string | null;
  confirmation_required: boolean;
};

type FindingRow = {
  title: string;
  finding: string;
  analysis: string | null;
  verification_status: string;
  agency: string | null;
  risk_level: string | null;
  recommendation: string | null;
  confirmation_required: boolean | null;
  client_visible: boolean | null;
  superseded_by?: string | null;
  /** Internal-only fields that must never be projected. */
  [key: string]: unknown;
};

/** Only client-visible, non-superseded findings, stripped of internal fields. */
export function toClientFindings(rows: FindingRow[]): ClientFinding[] {
  return rows
    .filter((r) => r.client_visible !== false && !r.superseded_by && r.verification_status !== "superseded")
    .map((r) => ({
      title: r.title,
      finding: r.finding,
      explanation: r.analysis ?? "",
      status_label: VERIFICATION_LABELS[r.verification_status as VerificationStatus] ?? "Pending Confirmation",
      agency: r.agency ?? null,
      risk_level: r.risk_level ?? "none",
      recommendation: r.recommendation ?? null,
      confirmation_required: r.confirmation_required !== false,
    }));
}

export type ClientProgress = {
  current_stage: string;
  completed_stages: string[];
  information_needed: string[];
  expected_next_action: string;
  percent_complete: number;
  updated_at: string;
};

/** Map internal run state onto the plain-language client journey. */
export function toClientProgress(run: {
  status: RunStatus;
  updated_at: string;
  tasks: Array<{ status: TaskStatus }>;
  open_questions?: string[];
}): ClientProgress {
  const label = CLIENT_STAGE_LABELS[run.status];
  const idx = CLIENT_PROGRESS_STAGES.indexOf(label as (typeof CLIENT_PROGRESS_STAGES)[number]);
  const completed = idx > 0 ? CLIENT_PROGRESS_STAGES.slice(0, idx) : [];
  const total = run.tasks.length;
  const done = run.tasks.filter((t) => t.status === "succeeded" || t.status === "skipped").length;
  const questions = run.open_questions ?? [];
  const next =
    run.status === "waiting_for_client"
      ? "Answer the questions listed so we can continue"
      : run.status === "delivered" || run.status === "approved"
        ? "Open your report"
        : "No action needed — we will update you as this moves forward";
  return {
    current_stage: label,
    completed_stages: [...completed],
    information_needed: questions,
    expected_next_action: next,
    percent_complete: total ? Math.round((done / total) * 100) : 0,
    updated_at: run.updated_at,
  };
}

const INTERNAL_KEYS = [
  "prompt",
  "system_prompt",
  "input_snapshot",
  "output_snapshot",
  "error",
  "failure_reason",
  "model",
  "input_units",
  "output_units",
  "estimated_cost",
  "credits_used",
  "total_usage",
  "internal_notes",
  "reviewer_notes",
];

/** Defensive strip used before any client-facing serialization. */
export function stripInternal<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!INTERNAL_KEYS.includes(k)) out[k] = v;
  return out as Partial<T>;
}
