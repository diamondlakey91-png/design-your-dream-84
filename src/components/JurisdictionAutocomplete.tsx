import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listJurisdictionProfiles } from "@/lib/jurisdictionProfiles.functions";
import { Input } from "@/components/ui/input";
import { Landmark, Check } from "lucide-react";

type Row = {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  county: string | null;
  jurisdiction_type: string | null;
  verification_status: string | null;
};

export function JurisdictionAutocomplete({
  value,
  onChange,
  placeholder = "e.g., Arlington County, VA",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTerm(value), [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const [debounced, setDebounced] = useState(term);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 180);
    return () => clearTimeout(t);
  }, [term]);

  const listFn = useServerFn(listJurisdictionProfiles);
  const q = useQuery({
    queryKey: ["jurisdiction-autocomplete", debounced],
    queryFn: () => listFn({ data: { q: debounced, state: "", jurisdiction_type: "", verified_only: false } }),
    enabled: open,
    staleTime: 60_000,
  });

  const rows = useMemo(() => (q.data ?? []) as Row[], [q.data]);

  const display = (r: Row) =>
    [r.name, r.state].filter(Boolean).join(", ") + (r.county && !r.name.toLowerCase().includes(r.county.toLowerCase()) ? ` · ${r.county}` : "");

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={term}
        onChange={(e) => { setTerm(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={200}
        autoComplete="off"
      />
      {open && (rows.length > 0 || q.isFetching) && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {q.isFetching && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          )}
          {rows.map((r) => {
            const label = display(r);
            const selected = label === value;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => { onChange(label); setTerm(label); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <Landmark className="size-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{label}</div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {r.jurisdiction_type || "jurisdiction"}
                    {r.verification_status === "verified" || r.verification_status === "recently_verified" ? " · verified" : ""}
                  </div>
                </div>
                {selected && <Check className="size-3.5 text-brand" />}
              </button>
            );
          })}
          {!q.isFetching && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matches — type freely to use a custom jurisdiction.</div>
          )}
        </div>
      )}
    </div>
  );
}
