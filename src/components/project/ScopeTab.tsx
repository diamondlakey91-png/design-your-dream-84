import { IntakeWizard } from "./IntakeWizard";
import { DueDiligenceReport } from "./DueDiligenceReport";
import { RoadmapView } from "./RoadmapView";

/**
 * Guided project intake → Due Diligence report → Permit Roadmap.
 *
 * The technical trade matrix has been replaced by the plain-language
 * IntakeWizard. After intake, the DueDiligenceReport summarizes the project
 * with verification badges before the Permit Roadmap is generated.
 */
export function ScopeTab({ projectId }: { projectId: string; defaultAddress?: string | null }) {
  return (
    <div className="space-y-6">
      <IntakeWizard projectId={projectId} />
      <DueDiligenceReport projectId={projectId} />
      <RoadmapView projectId={projectId} />
    </div>
  );
}
