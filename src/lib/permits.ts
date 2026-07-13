export const STAGES = [
  "Pre-Planning",
  "Plans Submitted",
  "In Review",
  "Approved",
  "Issued",
] as const;

export type Stage = (typeof STAGES)[number];

export function stageLabel(stage: number) {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))];
}
