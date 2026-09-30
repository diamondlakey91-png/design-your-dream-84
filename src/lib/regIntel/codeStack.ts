// PERMIVIO — code-stack applicability (pure, deterministic). Decides WHICH code volumes apply to a
// scope; edition/adoption evidence is handled separately (verification never comes from this module).
import type { ScopeAttribute } from "./scope";

export type Applicability = "applies" | "limited" | "not_primary";
export const APPLICABILITY_LABEL: Record<Applicability, string> = {
  applies: "Applies to this scope",
  limited: "Applies in part / confirm",
  not_primary: "Not the governing volume for this scope",
};

/** One- and two-family dwellings (and townhouses) fall under FBC–Residential (R101.2); everything else under FBC–Building. */
export function isDwellingScope(scope: Set<ScopeAttribute>): boolean {
  return scope.has("residential") && !scope.has("commercial") && !scope.has("mixed_use");
}

export function codeApplicability(discipline: string, scope: Set<ScopeAttribute>): { applicability: Applicability; basis: string } {
  const dwelling = isDwellingScope(scope);
  const existingWork = scope.has("alteration") || scope.has("addition") || scope.has("tenant_improvement") || scope.has("change_of_occupancy") || scope.has("change_of_use");
  switch (discipline) {
    case "residential":
      return dwelling ? { applicability: "applies", basis: "Detached one- and two-family dwellings are governed by FBC–Residential (scope R101.2)." } : { applicability: "not_primary", basis: "Not a one- or two-family dwelling scope." };
    case "building":
      return dwelling ? { applicability: "limited", basis: "FBC–Building governs where FBC–Residential does not (e.g. referenced chapters, high-velocity hurricane zone provisions)." } : { applicability: "applies", basis: "Non-dwelling buildings are governed by FBC–Building." };
    case "existing_building":
      return existingWork ? { applicability: "applies", basis: "Scope includes work on an existing building." } : { applicability: "not_primary", basis: "New construction — FBC–Existing Building governs work on existing buildings." };
    case "mechanical":
    case "plumbing":
    case "fuel_gas":
      return dwelling ? { applicability: "limited", basis: `Dwellings use the ${discipline.replace("_", " ")} chapters of FBC–Residential; the stand-alone volume applies where FBC–Residential refers to it.` } : { applicability: "applies", basis: "Non-dwelling scope." };
    case "energy":
      return scope.has("new_construction") || scope.has("addition") || scope.has("alteration") || scope.has("tenant_improvement") || scope.has("mechanical")
        ? { applicability: "applies", basis: "Conditioned new work must comply with the energy code." }
        : { applicability: "limited", basis: "Applies when conditioned space or energy systems are affected." };
    case "accessibility":
      return dwelling ? { applicability: "not_primary", basis: "Private one- and two-family dwellings are generally outside FBC–Accessibility scoping." } : { applicability: "applies", basis: "Commercial / public accommodation scope." };
    case "electrical":
      return scope.has("electrical") || scope.has("new_construction") || scope.has("tenant_improvement") ? { applicability: "applies", basis: "Scope includes electrical work." } : { applicability: "limited", basis: "Applies to any electrical work in the scope." };
    case "fire":
      return dwelling ? { applicability: "limited", basis: "The Florida Fire Prevention Code is generally not applied to one- and two-family dwelling plan review; confirm with the fire authority." } : { applicability: "applies", basis: "Non-dwelling occupancies are subject to the Florida Fire Prevention Code." };
    default:
      return { applicability: "limited", basis: "Applicability not rule-determined." };
  }
}
