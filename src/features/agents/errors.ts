// PERMIVIO agent framework — typed errors.
//
// Distinguishing temporary from permanent failures is what lets the executor
// retry a single task instead of re-running a whole report.

export type AgentErrorKind =
  | "temporary" // retryable: rate limit, upstream 5xx, truncated response
  | "permanent" // not retryable: bad schema after retries, unsupported input
  | "invalid_output"
  | "invalid_transition"
  | "cancelled"
  | "unauthorized"
  | "entitlement"
  | "quality_gate";

export class AgentError extends Error {
  readonly kind: AgentErrorKind;
  readonly agentKey?: string;
  readonly details?: unknown;

  constructor(kind: AgentErrorKind, message: string, opts?: { agentKey?: string; details?: unknown }) {
    super(message);
    this.name = "AgentError";
    this.kind = kind;
    if (opts?.agentKey !== undefined) this.agentKey = opts.agentKey;
    if (opts?.details !== undefined) this.details = opts.details;
  }

  get retryable() {
    return this.kind === "temporary";
  }
}

/** Classify an unknown thrown value so the executor can decide whether to retry. */
export function classifyError(e: unknown): AgentError {
  if (e instanceof AgentError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  const temporary = /429|too many requests|timeout|timed out|5\d\d|truncated|network|fetch failed|ECONN/i.test(msg);
  return new AgentError(temporary ? "temporary" : "permanent", msg);
}

/** Client-safe message. Internal errors, prompts and model details never reach the browser. */
export function clientSafeMessage(e: AgentError): string {
  switch (e.kind) {
    case "entitlement":
      return "This report is not included in your current plan or order.";
    case "unauthorized":
      return "You do not have access to this item.";
    case "quality_gate":
      return "The draft did not pass quality review yet.";
    case "cancelled":
      return "This request was cancelled.";
    default:
      return "We hit a problem preparing this. Our team has been notified.";
  }
}
