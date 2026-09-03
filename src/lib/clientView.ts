// Client-facing presentation layer.
//
// Pure translation helpers that turn PERMIVIO's internal permit data into
// plain-language statuses, milestones, and action items. Nothing here changes
// stored data — the professional/admin views keep using the raw fields.

export type ClientTone = "green" | "blue" | "yellow" | "red" | "gray";

export type ClientPermitItem = {
  id: string;
  project_id: string;
  name: string;
  category: string;
  status: string;
  required: boolean;
  due_date: string | null;
  notes: string;
};

export type ClientDeadline = {
  id: string;
  project_id: string | null;
  title: string;
  due_date: string;
};

export type ClientInspection = {
  id: string;
  project_id: string;
  status: string;
  inspection_type?: string | null;
};

export type ClientProjectInput = {
  id: string;
  name: string;
  status: string;
  current_stage: number;
  jurisdiction: string | null;
  location: string | null;
  project_type: string | null;
  permit_count: number;
  permits_issued: number;
  updated_at: string;
  created_at: string;
};

export type ClientSignals = {
  items: ClientPermitItem[];
  deadlines: ClientDeadline[];
  inspections: ClientInspection[];
  documentCount: number;
};

export const EMPTY_SIGNALS: ClientSignals = { items: [], deadlines: [], inspections: [], documentCount: 0 };

/** The 12 milestones a permitting project actually moves through. */
export const CLIENT_MILESTONES = [
  { key: "research", label: "Research complete", detail: "We reviewed the address and what you want to build." },
  { key: "jurisdiction", label: "Jurisdiction confirmed", detail: "We confirmed which city, county, fire, and health offices have authority." },
  { key: "requirements", label: "Requirements identified", detail: "We listed the approvals and documents this project needs." },
  { key: "documents", label: "Documents collected", detail: "Your drawings, forms, and supporting files are in the project." },
  { key: "plans_ready", label: "Plans ready", detail: "The required documents are prepared and checked before filing." },
  { key: "submitted", label: "Permit submitted", detail: "The application was filed with the reviewing office." },
  { key: "initial_review", label: "Initial review complete", detail: "The reviewers finished their first pass and sent back any comments." },
  { key: "corrections", label: "Corrections resolved", detail: "Every reviewer comment has a response and revised document." },
  { key: "issued", label: "Permit issued", detail: "The permit is approved and released for construction." },
  { key: "inspections", label: "Inspections complete", detail: "All required site inspections have passed." },
  { key: "final_approval", label: "Final approval complete", detail: "All departments signed off on the finished work." },
  { key: "cofo", label: "Certificate of Occupancy complete", detail: "The building is legally cleared to open and be used." },
] as const;

export type MilestoneKey = (typeof CLIENT_MILESTONES)[number]["key"];

const ISSUED = new Set(["issued"]);
const APPROVED_OR_BETTER = new Set(["approved", "issued"]);
const FILED_OR_BETTER = new Set(["submitted", "under_review", "approved", "issued"]);

function isCofO(name: string) {
  const n = name.toLowerCase();
  return n.includes("certificate of occupancy") || n.includes("c of o") || n.includes("cofo") || n.includes(" c/o");
}

function activeItems(items: ClientPermitItem[]) {
  return items.filter((i) => i.status !== "n_a");
}

/** Which of the 12 milestones are done, using only real project signals. */
export function milestoneState(project: ClientProjectInput, signals: ClientSignals) {
  const items = activeItems(signals.items);
  const required = items.filter((i) => i.required);
  const docItems = items.filter((i) => /document|plan|drawing|form|submittal/i.test(i.category) || /plan|drawing|letter|form/i.test(i.name));
  const cofoItems = items.filter((i) => isCofO(i.name));
  const inspections = signals.inspections;
  const passed = inspections.filter((i) => /pass|approved|complete/i.test(i.status));
  const stage = project.current_stage;

  const done: Record<MilestoneKey, boolean> = {
    research: Boolean(project.location) || items.length > 0,
    jurisdiction: Boolean(project.jurisdiction),
    requirements: items.length > 0,
    documents: signals.documentCount > 0,
    plans_ready: docItems.length > 0 && docItems.every((i) => i.status !== "not_started"),
    submitted: items.some((i) => FILED_OR_BETTER.has(i.status)) || stage >= 1,
    initial_review: items.some((i) => APPROVED_OR_BETTER.has(i.status)) || stage >= 3,
    corrections: stage >= 3 && items.every((i) => i.status !== "not_started"),
    issued: project.permits_issued > 0 || items.some((i) => ISSUED.has(i.status)) || stage >= 4,
    inspections: inspections.length > 0 && passed.length === inspections.length,
    final_approval: inspections.length > 0 && passed.length === inspections.length && required.every((i) => APPROVED_OR_BETTER.has(i.status)),
    cofo: cofoItems.length > 0 && cofoItems.every((i) => APPROVED_OR_BETTER.has(i.status)),
  };

  const steps = CLIENT_MILESTONES.map((m) => ({ ...m, done: done[m.key] }));
  const completed = steps.filter((s) => s.done).length;
  const currentIndex = steps.findIndex((s) => !s.done);
  return {
    steps,
    completed,
    total: steps.length,
    currentIndex: currentIndex === -1 ? steps.length - 1 : currentIndex,
    percent: Math.round((completed / steps.length) * 100),
  };
}

export type ClientStatus = { label: string; tone: ClientTone; plain: string };

/**
 * Plain-language project status. Internal enums (draft, under_review,
 * needs_followup, …) never reach the client screen.
 */
export function clientStatus(project: ClientProjectInput, signals: ClientSignals, attentionCount: number): ClientStatus {
  const raw = (project.status || "").toLowerCase();
  const items = activeItems(signals.items);
  const ms = milestoneState(project, signals);

  if (raw.includes("hold")) return { label: "On Hold", tone: "gray", plain: "This project is paused right now." };

  if (attentionCount > 0) {
    return {
      label: "Needs Your Attention",
      tone: "yellow",
      plain: `We need ${attentionCount} thing${attentionCount === 1 ? "" : "s"} from you before this can move forward.`,
    };
  }

  if (ms.steps.find((s) => s.key === "cofo")?.done) {
    return { label: "Certificate of Occupancy", tone: "green", plain: "Your Certificate of Occupancy is complete. You're cleared to open." };
  }
  if (ms.steps.find((s) => s.key === "inspections")?.done) {
    return { label: "Final Approvals", tone: "green", plain: "Inspections passed. We're closing out the final approvals." };
  }
  if (signals.inspections.length > 0) {
    return { label: "Inspections", tone: "blue", plain: "Your permit is issued and inspections are underway." };
  }
  if (ms.steps.find((s) => s.key === "issued")?.done) {
    return { label: "Permit Issued", tone: "green", plain: "Your permit has been issued. Construction can proceed." };
  }
  if (raw.includes("correction") || raw.includes("revision")) {
    return { label: "Corrections Needed", tone: "red", plain: "The reviewers sent comments back. We're preparing the corrections." };
  }
  if (raw.includes("resubmit")) {
    return { label: "Resubmitted", tone: "blue", plain: "The corrected documents went back to the reviewing office." };
  }
  if (items.some((i) => i.status === "under_review") || raw.includes("review") || project.current_stage === 2) {
    return { label: "Jurisdiction Review", tone: "blue", plain: "Your application is being reviewed by the jurisdiction. Nothing is needed from you right now." };
  }
  if (items.some((i) => i.status === "submitted") || raw.includes("submit") || project.current_stage === 1) {
    return { label: "Submitted", tone: "blue", plain: "Your application has been filed and is waiting to be picked up for review." };
  }
  if (ms.steps.find((s) => s.key === "plans_ready")?.done) {
    return { label: "Ready to Submit", tone: "blue", plain: "Everything is prepared. We're ready to file the application." };
  }
  if (signals.documentCount > 0) {
    return { label: "Plans Being Prepared", tone: "blue", plain: "We're organizing and checking your documents before filing." };
  }
  if (items.length > 0) {
    return { label: "Waiting for Documents", tone: "yellow", plain: "We're waiting on the documents this project needs." };
  }
  if (project.jurisdiction) {
    return { label: "Researching Requirements", tone: "blue", plain: "We're identifying which approvals this project needs." };
  }
  return { label: "Getting Started", tone: "gray", plain: "We're setting up your project and confirming the basics." };
}

/** Friendly name for the phase the project is in right now. */
export function currentPhase(project: ClientProjectInput, signals: ClientSignals) {
  const ms = milestoneState(project, signals);
  return ms.steps[ms.currentIndex]?.label ?? "Project setup";
}

/** What happens next, written for someone who has never pulled a permit. */
export function nextStep(project: ClientProjectInput, signals: ClientSignals, attention: AttentionItem[]) {
  if (attention.length > 0) return attention[0].whatIsNeeded;
  const ms = milestoneState(project, signals);
  const step = ms.steps[ms.currentIndex];
  const where = project.jurisdiction || "the jurisdiction";
  switch (step?.key) {
    case "research": return "We're reviewing the address and the work you want to do.";
    case "jurisdiction": return `We're confirming which offices have authority over this address.`;
    case "requirements": return `We're identifying the approvals ${where} will require.`;
    case "documents": return "We're collecting the documents this project needs.";
    case "plans_ready": return "We're checking the documents before the application is filed.";
    case "submitted": return `We're preparing to file the application with ${where}.`;
    case "initial_review": return `Waiting for ${where} to finish the first review.`;
    case "corrections": return "We're resolving the reviewer comments and preparing the resubmittal.";
    case "issued": return `Waiting for ${where} to release the permit.`;
    case "inspections": return "We're scheduling and tracking the required inspections.";
    case "final_approval": return "We're collecting the final department sign-offs.";
    case "cofo": return "We're finishing the Certificate of Occupancy paperwork.";
    default: return "We're reviewing what comes next on this project.";
  }
}

export type AttentionActionKind = "upload" | "review" | "confirm" | "pay" | "view";

export type AttentionItem = {
  id: string;
  projectId: string;
  projectName: string;
  /** Plain-language ask, e.g. "Upload the revised architectural plans". */
  whatIsNeeded: string;
  /** Why we need it, in one sentence. */
  why: string;
  dueDate: string | null;
  action: AttentionActionKind;
  actionLabel: string;
  /** Which project tab to open. */
  tab: string;
  tone: ClientTone;
};

const ACTION_LABEL: Record<AttentionActionKind, string> = {
  upload: "Upload Document",
  review: "Review",
  confirm: "Confirm",
  pay: "Pay Fee",
  view: "View Request",
};

function classifyAsk(item: ClientPermitItem): { action: AttentionActionKind; tab: string; whatIsNeeded: string; why: string } {
  const n = item.name.toLowerCase();
  if (/fee|payment|invoice/.test(n)) {
    return {
      action: "pay",
      tab: "checklist",
      whatIsNeeded: `Pay the ${item.name.toLowerCase()}`,
      why: "The jurisdiction will not release or review the application until the fee is paid.",
    };
  }
  if (/sign|authorization|notariz|affidavit|letter of agent|loa/.test(n)) {
    return {
      action: "confirm",
      tab: "docs",
      whatIsNeeded: `Sign the ${item.name.toLowerCase()}`,
      why: "The jurisdiction requires the property owner's signature before we can file on your behalf.",
    };
  }
  if (/plan|drawing|survey|sheet|calc|report|photo/.test(n)) {
    return {
      action: "upload",
      tab: "docs",
      whatIsNeeded: `Upload the ${item.name.toLowerCase()}`,
      why: "This document is part of the required submittal package for this project.",
    };
  }
  if (/scope|equipment|contractor|contact|information|list/.test(n)) {
    return {
      action: "confirm",
      tab: "scope",
      whatIsNeeded: `Confirm the ${item.name.toLowerCase()}`,
      why: "We need this detail confirmed so the application matches what will actually be built.",
    };
  }
  return {
    action: "view",
    tab: "checklist",
    whatIsNeeded: `Provide the ${item.name}`,
    why: "This item is required before the project can move to the next step.",
  };
}

/**
 * Only ask the client for things a client can actually hand over: documents,
 * signatures, fees, and project facts. Permits, approvals, and inspections are
 * PERMIVIO's work and never appear as client to-dos.
 */
function isClientDeliverable(item: ClientPermitItem) {
  const n = `${item.name} ${item.category}`.toLowerCase();
  const clientish = /plan|drawing|survey|sheet|calc|report|photo|fee|payment|invoice|sign|authorization|notariz|affidavit|agent|scope|equipment|contractor|contact|information|list|form|application/;
  const ahjWork = /permit|approval|inspection|certificate of occupancy|c of o|review|clearance|license/;
  if (clientish.test(n)) return true;
  return !ahjWork.test(n);
}

/** Everything PERMIVIO is waiting on from the client, across one or all projects. */
export function attentionItems(project: ClientProjectInput, signals: ClientSignals): AttentionItem[] {
  const out: AttentionItem[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const item of signals.items) {
    if (!item.required || item.status !== "not_started") continue;
    if (!isClientDeliverable(item)) continue; // permits/approvals are PERMIVIO's job, not the client's
    const ask = classifyAsk(item);
    const overdue = item.due_date ? new Date(item.due_date) < today : false;
    out.push({
      id: `item-${item.id}`,
      projectId: project.id,
      projectName: project.name,
      whatIsNeeded: ask.whatIsNeeded,
      why: item.notes?.trim() ? item.notes.trim() : ask.why,
      dueDate: item.due_date,
      action: ask.action,
      actionLabel: ACTION_LABEL[ask.action],
      tab: ask.tab,
      tone: overdue ? "red" : "yellow",
    });
  }

  for (const d of signals.deadlines) {
    const due = new Date(d.due_date);
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (days > 7) continue;
    out.push({
      id: `deadline-${d.id}`,
      projectId: project.id,
      projectName: project.name,
      whatIsNeeded: d.title,
      why: days < 0 ? "This date has already passed — let's confirm where it stands." : "This date is coming up in the next week.",
      dueDate: d.due_date,
      action: "review",
      actionLabel: ACTION_LABEL.review,
      tab: "deadlines",
      tone: days < 0 ? "red" : "yellow",
    });
  }

  const failedInspection = signals.inspections.some((i) => /fail|reject/i.test(i.status));
  if (failedInspection) {
    out.push({
      id: `insp-${project.id}`,
      projectId: project.id,
      projectName: project.name,
      whatIsNeeded: "Review an inspection that did not pass",
      why: "An inspector noted items to correct before the next visit can be scheduled.",
      dueDate: null,
      action: "review",
      actionLabel: ACTION_LABEL.review,
      tab: "inspections",
      tone: "red",
    });
  }

  return out.sort((a, b) => {
    const rank = (t: ClientTone) => (t === "red" ? 0 : t === "yellow" ? 1 : 2);
    if (rank(a.tone) !== rank(b.tone)) return rank(a.tone) - rank(b.tone);
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

/** Plain-language "current risks" bullets for the project overview. */
export function currentRisks(project: ClientProjectInput, signals: ClientSignals): string[] {
  const risks: string[] = [];
  const items = activeItems(signals.items);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue = signals.deadlines.filter((d) => new Date(d.due_date) < today);
  if (overdue.length > 0) {
    risks.push(`${overdue.length} date${overdue.length === 1 ? " has" : "s have"} already passed. We're confirming the current status with the jurisdiction.`);
  }
  const missingRequired = items.filter((i) => i.required && i.status === "not_started").length;
  if (missingRequired > 0) {
    risks.push(`${missingRequired} required item${missingRequired === 1 ? " is" : "s are"} still outstanding, which can delay filing.`);
  }
  if (!project.jurisdiction) {
    risks.push("The reviewing jurisdiction is not confirmed yet, so requirements may change once it is.");
  }
  if (signals.inspections.some((i) => /fail|reject/i.test(i.status))) {
    risks.push("An inspection did not pass. Corrections are needed before the next visit.");
  }
  if (risks.length === 0) risks.push("No blockers identified right now.");
  return risks;
}

/** One-line summary of what we need from the client on this project. */
export function whatWeNeed(attention: AttentionItem[]): string {
  if (attention.length === 0) return "Nothing right now. We'll reach out here the moment we need something.";
  if (attention.length === 1) return `${attention[0].whatIsNeeded} — ${attention[0].why}`;
  return `${attention.length} items: ${attention.slice(0, 3).map((a) => a.whatIsNeeded).join(", ")}${attention.length > 3 ? "…" : ""}`;
}

/** Turn an internal activity line into something a client can read. */
export function friendlyActivity(description: string): string {
  const d = description.trim();
  const arrow = d.match(/^(.*?)\s*→\s*(.*)$/);
  if (arrow) {
    const [, name, status] = arrow;
    const s = status.toLowerCase().replace(/_/g, " ");
    const phrase =
      s.includes("issued") ? "was issued" :
      s.includes("approved") ? "was approved" :
      s.includes("under review") ? "entered review" :
      s.includes("submitted") ? "was submitted" :
      s.includes("not started") ? "was reset to not started" :
      s.includes("n a") || s.includes("n/a") ? "was marked not applicable" :
      `was updated to ${s}`;
    return `${name.trim()} ${phrase}.`;
  }
  const cleaned = d.replace(/\b([a-z]+_)+[a-z]+\b/g, (m) => m.replace(/_/g, " "));
  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}

export const TONE_CLASSES: Record<ClientTone, { badge: string; dot: string; bar: string }> = {
  green: {
    badge: "border-[oklch(0.75_0.16_155)]/40 bg-[oklch(0.75_0.16_155)]/12 text-[oklch(0.82_0.15_155)]",
    dot: "bg-[oklch(0.75_0.16_155)]",
    bar: "bg-[oklch(0.75_0.16_155)]",
  },
  blue: { badge: "border-primary/40 bg-primary/12 text-primary", dot: "bg-primary", bar: "bg-primary" },
  yellow: {
    badge: "border-[oklch(0.66_0.19_258)]/40 bg-[oklch(0.66_0.19_258)]/12 text-[oklch(0.72_0.17_258)]",
    dot: "bg-[oklch(0.66_0.19_258)]",
    bar: "bg-[oklch(0.66_0.19_258)]",
  },
  red: { badge: "border-destructive/40 bg-destructive/12 text-destructive", dot: "bg-destructive", bar: "bg-destructive" },
  gray: { badge: "border-border bg-secondary/60 text-muted-foreground", dot: "bg-muted-foreground", bar: "bg-muted-foreground" },
};

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function firstName(fullName: string | null | undefined, email: string | null | undefined): string {
  const name = (fullName ?? "").trim();
  if (name) return name.split(/\s+/)[0];
  const local = (email ?? "").split("@")[0] ?? "";
  const guess = local.replace(/[._\-0-9]+/g, " ").trim().split(/\s+/)[0];
  if (!guess) return "there";
  return guess.charAt(0).toUpperCase() + guess.slice(1);
}
