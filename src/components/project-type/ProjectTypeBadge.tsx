import { Badge } from "@/components/ui/badge";
import { useProjectTypes } from "@/hooks/useProjectTypes";

export function ProjectTypeBadge({
  primaryId,
  additionalIds = [],
  fallbackText,
  compact,
}: {
  primaryId?: string | null;
  additionalIds?: string[];
  fallbackText?: string | null;
  compact?: boolean;
}) {
  const { byId, isLoading } = useProjectTypes();
  const primary = primaryId ? byId.get(primaryId) : undefined;
  const additional = additionalIds.map((id) => byId.get(id)).filter(Boolean) as ReturnType<typeof byId.get> extends infer T ? NonNullable<T>[] : never;

  if (!primary && !fallbackText) {
    return isLoading ? null : <Badge variant="outline" className="text-amber-300 border-amber-500/40">Project type needs confirmation</Badge>;
  }

  if (compact) {
    return (
      <span className="text-xs text-muted-foreground">
        {primary?.client_label ?? fallbackText}
        {additional.length > 0 && <span className="text-muted-foreground/70"> · +{additional.length} more</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className="bg-primary/15 text-primary border-primary/30">
        {primary?.client_label ?? fallbackText}
      </Badge>
      {additional.map((a) => (
        <Badge key={a!.id} variant="outline" className="text-xs">{a!.client_label}</Badge>
      ))}
    </div>
  );
}
