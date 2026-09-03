import { disciplineLabel, indexStateLabel } from "@/lib/qaqcConfig";

export type QaQcSheetRow = {
  id: string;
  sheet_number: string;
  sheet_title: string | null;
  discipline: string;
  revision_number: string | null;
  revision_date: string | null;
  professional_of_record: string | null;
  seal_status: string;
  index_state: string;
  notes: string | null;
};

const stateKlass: Record<string, string> = {
  present: "text-emerald-400",
  missing_from_upload: "text-red-400",
  not_indexed: "text-amber-400",
  duplicate: "text-orange-400",
  superseded: "text-muted-foreground",
};

const sealLabel: Record<string, string> = {
  sealed_signed: "Sealed & signed",
  sealed_unsigned: "Seal, signature not visible",
  not_visible: "Not visible in upload",
  illegible: "Present but illegible",
};

export function QaQcInventoryTable({ sheets }: { sheets: QaQcSheetRow[] }) {
  if (!sheets.length) {
    return <p className="text-sm text-muted-foreground">No sheets were detected in this upload.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Sheet</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Discipline</th>
            <th className="px-3 py-2">Rev</th>
            <th className="px-3 py-2">Professional of record</th>
            <th className="px-3 py-2">Seal / signature</th>
            <th className="px-3 py-2">Index status</th>
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => (
            <tr key={s.id} className="border-t border-border/60 align-top">
              <td className="whitespace-nowrap px-3 py-2 font-mono font-medium">{s.sheet_number}</td>
              <td className="px-3 py-2">{s.sheet_title || <span className="text-muted-foreground">—</span>}</td>
              <td className="whitespace-nowrap px-3 py-2 capitalize text-muted-foreground">{disciplineLabel(s.discipline)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {s.revision_number || "—"}{s.revision_date ? ` · ${s.revision_date}` : ""}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{s.professional_of_record || "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{sealLabel[s.seal_status] ?? s.seal_status}</td>
              <td className={`whitespace-nowrap px-3 py-2 ${stateKlass[s.index_state] ?? ""}`}>
                {indexStateLabel(s.index_state)}
                {s.notes && <span className="block text-[10px] text-muted-foreground">{s.notes}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
