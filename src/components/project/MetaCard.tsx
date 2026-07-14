import type { ReactNode } from "react";

export function MetaCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-foreground font-medium mt-1 block">{value}</span>
    </div>
  );
}
