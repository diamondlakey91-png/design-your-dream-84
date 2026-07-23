import { IntakeWizard } from "./IntakeWizard";
import { RoadmapView } from "./RoadmapView";

/**
 * ScopeTab is the guided, plain-language intake experience.
 *
 * The technical trade matrix / IBC construction type form has been replaced
 * by the IntakeWizard — beginner-friendly, address-first, jurisdiction-
 * confirmation-gated. All existing scope_of_work columns still populate
 * (via mapFriendlyToInternal + deriveScopeFromAnswers), so the rule engine
 * and Permit Roadmap continue to work unchanged.
 */
export function ScopeTab({ projectId }: { projectId: string; defaultAddress?: string | null }) {
  return (
    <div className="space-y-6">
      <IntakeWizard projectId={projectId} />
      <RoadmapView projectId={projectId} />
    </div>
  );
}
