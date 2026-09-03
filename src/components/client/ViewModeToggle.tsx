import { Sparkles, SlidersHorizontal } from "lucide-react";
import type { ViewMode } from "@/hooks/useViewMode";

export function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border p-1" role="group" aria-label="Dashboard detail level">
      <Tab active={mode === "client"} onClick={() => onChange("client")} icon={<Sparkles className="size-3.5" />} label="Simple view" />
      <Tab active={mode === "pro"} onClick={() => onChange("pro")} icon={<SlidersHorizontal className="size-3.5" />} label="Professional" />
    </div>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}
