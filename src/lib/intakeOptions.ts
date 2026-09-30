// Shared Start a Project / Edit Project intake options (same values in both).
export const OCCUPANCY_OPTIONS = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "mixed_use", label: "Mixed use" },
] as const;
export const WORK_TYPE_OPTIONS = [
  { value: "new_construction", label: "New construction" },
  { value: "addition", label: "Addition" },
  { value: "alteration", label: "Alteration / renovation" },
  { value: "tenant_improvement", label: "Tenant improvement" },
  { value: "change_of_occupancy", label: "Change of use" },
  { value: "demolition", label: "Demolition" },
  { value: "other", label: "Other" },
] as const;
