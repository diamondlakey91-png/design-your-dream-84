import { useMemo, useState, useEffect } from "react";
import { Check, ChevronsUpDown, Search, Sparkles, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useProjectTypes, getRecentProjectTypes, rememberRecentProjectType } from "@/hooks/useProjectTypes";
import type { ProjectTypeDTO } from "@/lib/projectTypes.functions";
import { ProjectTypeBadge } from "./ProjectTypeBadge";

export type SelectorMode =
  | "single"
  | "primary_additional"
  | "multi"
  | "readonly"
  | "ai_recommend";

export type ProjectTypeValue = {
  primaryId?: string | null;
  additionalIds?: string[];
  customDescription?: string | null;
};

export type AiSuggestion = { id: string; confidence: number; reason?: string };

export function ProjectTypeSelector({
  mode,
  value,
  onChange,
  label = "What are you planning to do?",
  helperText = "Choose the option that best describes your project. PERMIVIO will help identify any additional work and permits.",
  aiSuggestions = [],
  onAcceptAi,
  onDismissAi,
  allowOther = true,
  allowNotSure = true,
  className,
}: {
  mode: SelectorMode;
  value: ProjectTypeValue;
  onChange?: (v: ProjectTypeValue) => void;
  label?: string;
  helperText?: string;
  aiSuggestions?: AiSuggestion[];
  onAcceptAi?: (id: string) => void;
  onDismissAi?: (id: string) => void;
  allowOther?: boolean;
  allowNotSure?: boolean;
  className?: string;
}) {
  const { types, categories, byId, isLoading } = useProjectTypes();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => { setRecent(getRecentProjectTypes()); }, []);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return types;
    return types.filter((t) => {
      const hay = [t.client_label, t.internal_name, t.short_description ?? "", ...t.aliases, ...t.common_scope_triggers].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [types, q]);

  const grouped = useMemo(() => {
    const m = new Map<string, ProjectTypeDTO[]>();
    for (const t of filtered) {
      const list = m.get(t.category_name) ?? [];
      list.push(t);
      m.set(t.category_name, list);
    }
    return categories
      .map((c) => ({ name: c.category_name, items: m.get(c.category_name) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, categories]);

  const notSure = types.find((t) => t.internal_name === "not_sure");
  const other = types.find((t) => t.internal_name === "other");

  // ---------- Readonly ----------
  if (mode === "readonly") {
    return <ProjectTypeBadge primaryId={value.primaryId} additionalIds={value.additionalIds ?? []} fallbackText={value.customDescription ?? null} />;
  }

  const setPrimary = (id: string | null) => {
    if (id) rememberRecentProjectType(id);
    onChange?.({ ...value, primaryId: id });
    setOpen(false);
    setQuery("");
  };

  const toggleAdditional = (id: string) => {
    if (!onChange) return;
    const set = new Set(value.additionalIds ?? []);
    if (set.has(id)) set.delete(id); else set.add(id);
    rememberRecentProjectType(id);
    onChange({ ...value, additionalIds: Array.from(set) });
  };

  const toggleMulti = (id: string) => {
    if (!onChange) return;
    const cur = value.additionalIds ?? [];
    const has = cur.includes(id);
    const next = has ? cur.filter((x) => x !== id) : [...cur, id];
    if (!has) rememberRecentProjectType(id);
    onChange({ ...value, additionalIds: next });
  };

  const primary = value.primaryId ? byId.get(value.primaryId) : undefined;

  // ---------- Trigger button ----------
  const triggerLabel = mode === "multi"
    ? `${(value.additionalIds ?? []).length || "0"} selected`
    : primary?.client_label ?? "Select project type";

  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label className="text-sm text-foreground/90">{label}</Label>}
      {helperText && <p className="text-xs text-muted-foreground -mt-1">{helperText}</p>}

      {aiSuggestions.length > 0 && mode === "ai_recommend" && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="text-xs font-medium flex items-center gap-1.5"><Sparkles className="size-3.5 text-primary" /> AI suggestions</div>
          {aiSuggestions.map((s) => {
            const t = byId.get(s.id);
            if (!t) return null;
            return (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{t.client_label} <span className="text-xs text-muted-foreground">· {Math.round(s.confidence * 100)}%</span></div>
                  {s.reason && <div className="text-xs text-muted-foreground truncate">{s.reason}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => onAcceptAi?.(s.id)}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => onDismissAi?.(s.id)}><X className="size-3.5" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className={cn("truncate", !primary && mode !== "multi" && "text-muted-foreground")}>{triggerLabel}</span>
            <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project types, aliases, or keywords…"
              className="h-8 border-0 focus-visible:ring-0 px-0"
            />
          </div>
          <ScrollArea className="h-72">
            <div className="p-1">
              {isLoading && <div className="text-sm p-3 text-muted-foreground">Loading…</div>}

              {!q && recent.length > 0 && (
                <>
                  <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground">Recently used</div>
                  {recent.map((id) => byId.get(id)).filter(Boolean).slice(0, 5).map((t) => (
                    <ItemRow key={"recent-" + t!.id} t={t!} value={value} mode={mode} onPrimary={setPrimary} onAdditional={toggleAdditional} onMulti={toggleMulti} />
                  ))}
                </>
              )}

              {grouped.map((g) => (
                <div key={g.name}>
                  <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground">{g.name}</div>
                  {g.items.map((t) => (
                    <ItemRow key={t.id} t={t} value={value} mode={mode} onPrimary={setPrimary} onAdditional={toggleAdditional} onMulti={toggleMulti} />
                  ))}
                </div>
              ))}
              {grouped.length === 0 && !isLoading && (
                <div className="text-sm p-3 text-muted-foreground">No matches. {allowOther && "Choose \"Other\" and describe your project below."}</div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Primary + additional inline chips */}
      {mode === "primary_additional" && (value.additionalIds?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground mr-1 self-center">Also includes:</span>
          {(value.additionalIds ?? []).map((id) => {
            const t = byId.get(id);
            if (!t) return null;
            return (
              <Badge key={id} variant="outline" className="gap-1">
                {t.client_label}
                <button type="button" onClick={() => toggleAdditional(id)} className="opacity-60 hover:opacity-100">
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {mode === "multi" && (value.additionalIds?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(value.additionalIds ?? []).map((id) => {
            const t = byId.get(id);
            if (!t) return null;
            return (
              <Badge key={id} variant="outline" className="gap-1">
                {t.client_label}
                <button type="button" onClick={() => toggleMulti(id)} className="opacity-60 hover:opacity-100">
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {allowNotSure && notSure && mode !== "multi" && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setPrimary(notSure.id)} className="text-xs">
            <HelpCircle className="size-3.5 mr-1" /> I'm not sure
          </Button>
        )}
        {allowOther && other && (primary?.internal_name === "other" || value.customDescription) && (
          <span className="text-xs text-muted-foreground self-center">Describe your project below ↓</span>
        )}
      </div>

      {(primary?.internal_name === "other" || (allowOther && !primary && (value.customDescription ?? "").length > 0)) && (
        <div className="pt-1">
          <Textarea
            value={value.customDescription ?? ""}
            onChange={(e) => onChange?.({ ...value, customDescription: e.target.value })}
            placeholder="Describe your project in your own words…"
            rows={3}
          />
        </div>
      )}
    </div>
  );
}

function ItemRow({
  t, value, mode, onPrimary, onAdditional, onMulti,
}: {
  t: ProjectTypeDTO;
  value: ProjectTypeValue;
  mode: SelectorMode;
  onPrimary: (id: string) => void;
  onAdditional: (id: string) => void;
  onMulti: (id: string) => void;
}) {
  const isPrimary = value.primaryId === t.id;
  const isAdditional = (value.additionalIds ?? []).includes(t.id);

  const click = () => {
    if (mode === "multi") onMulti(t.id);
    else if (mode === "primary_additional" && value.primaryId && value.primaryId !== t.id) onAdditional(t.id);
    else onPrimary(t.id);
  };

  return (
    <button
      type="button"
      onClick={click}
      className={cn(
        "w-full flex items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none",
        (isPrimary || (mode === "multi" && isAdditional)) && "bg-primary/10",
      )}
    >
      <div className="mt-0.5 size-4 shrink-0">
        {isPrimary && <Check className="size-4 text-primary" />}
        {!isPrimary && mode === "multi" && isAdditional && <Check className="size-4 text-primary" />}
        {!isPrimary && mode === "primary_additional" && isAdditional && <Check className="size-4 text-primary/70" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate">{t.client_label}</div>
        {t.short_description && <div className="text-xs text-muted-foreground truncate">{t.short_description}</div>}
      </div>
    </button>
  );
}
