// PERMIVIO agent framework — execution state machine.
//
// Invalid transitions are rejected. A failed run cannot become delivered, a run
// with unresolved critical QA/QC failures cannot be approved, professional
// review requires a recorded human action, cancelled runs stop executing, and
// superseded findings cannot be reused in a new final report.

import { AgentError } from "./errors";
import type { RunStatus, TaskStatus } from "./types";
import { TERMINAL_RUN_STATUSES } from "./types";

const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft: ["queued", "cancelled"],
  queued: ["planning", "cancelled", "failed"],
  planning: ["researching", "processing_documents", "waiting_for_dependency", "waiting_for_client", "failed", "cancelled"],
  waiting_for_dependency: ["researching", "processing_documents", "analyzing", "failed", "cancelled"],
  researching: ["processing_documents", "analyzing", "waiting_for_dependency", "waiting_for_client", "conflict_detected", "qaqc_pending", "failed", "cancelled"],
  processing_documents: ["analyzing", "researching", "waiting_for_client", "conflict_detected", "qaqc_pending", "failed", "cancelled"],
  analyzing: ["qaqc_pending", "waiting_for_client", "conflict_detected", "researching", "failed", "cancelled"],
  waiting_for_client: ["researching", "processing_documents", "analyzing", "cancelled", "failed"],
  conflict_detected: ["analyzing", "qaqc_pending", "waiting_for_client", "cancelled", "failed"],
  qaqc_pending: ["qaqc_in_progress", "cancelled", "failed"],
  qaqc_in_progress: ["corrections_required", "professional_review_pending", "approved", "conflict_detected", "cancelled", "failed"],
  corrections_required: ["researching", "analyzing", "qaqc_pending", "cancelled", "failed"],
  professional_review_pending: ["professional_review_in_progress", "corrections_required", "cancelled", "failed"],
  professional_review_in_progress: ["approved", "corrections_required", "cancelled", "failed"],
  approved: ["delivered", "superseded", "cancelled"],
  delivered: ["superseded"],
  failed: ["queued", "cancelled"], // a failed run may be re-queued, never delivered directly
  cancelled: [],
  superseded: [],
};

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["waiting_for_dependency", "running", "skipped", "cancelled"],
  waiting_for_dependency: ["running", "skipped", "cancelled", "failed"],
  running: ["succeeded", "failed", "waiting_for_client", "cancelled", "needs_manual_review"],
  waiting_for_client: ["running", "cancelled", "failed"],
  succeeded: [],
  failed: ["running", "needs_manual_review", "skipped", "cancelled"], // retry re-enters running
  skipped: [],
  cancelled: [],
  needs_manual_review: ["running", "skipped", "cancelled"],
};

export type ApprovalGuards = {
  /** True when at least one blocking QA/QC check is unresolved. */
  criticalQaFailures: number;
  /** Whether a human review action has been recorded for this revision. */
  humanReviewRecorded: boolean;
  /** Whether the workflow requires professional review before approval. */
  professionalReviewRequired: boolean;
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return (RUN_TRANSITIONS[from] ?? []).includes(to);
}

export function assertRunTransition(from: RunStatus, to: RunStatus, guards?: ApprovalGuards): void {
  if (!canTransitionRun(from, to)) {
    throw new AgentError("invalid_transition", `Run cannot move from "${from}" to "${to}"`);
  }
  if (to === "approved") {
    if (!guards) throw new AgentError("invalid_transition", "Approval requires quality-gate and review guards");
    if (guards.criticalQaFailures > 0) {
      throw new AgentError("quality_gate", `Approval blocked: ${guards.criticalQaFailures} unresolved critical quality check(s)`);
    }
    if (guards.professionalReviewRequired && !guards.humanReviewRecorded) {
      throw new AgentError("invalid_transition", "Approval blocked: no recorded human professional review action");
    }
  }
  if (to === "delivered" && from !== "approved") {
    throw new AgentError("invalid_transition", "Only an approved run can be delivered");
  }
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new AgentError("invalid_transition", `Task cannot move from "${from}" to "${to}"`);
  }
}

/** A retry is allowed only while attempts remain and the run is still live. */
export function canRetryTask(opts: { attempt: number; maxAttempts: number; runStatus: RunStatus; retryable: boolean }): boolean {
  if (!opts.retryable) return false;
  if (isRunHalted(opts.runStatus)) return false;
  return opts.attempt < opts.maxAttempts;
}

export function isRunHalted(status: RunStatus): boolean {
  return status === "cancelled" || TERMINAL_RUN_STATUSES.includes(status);
}

/** Superseded findings must never be reused in a new final deliverable. */
export function usableInFinalReport(finding: { verification_status: string; superseded_by?: string | null }): boolean {
  return finding.verification_status !== "superseded" && !finding.superseded_by;
}

/** Progress percentage from task counts — client-safe, no internals. */
export function runProgress(tasks: Array<{ status: TaskStatus }>): number {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === "succeeded" || t.status === "skipped").length;
  return Math.round((done / tasks.length) * 100);
}
