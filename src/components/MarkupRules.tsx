import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CourierLogo } from "@/components/brand";
import { apiGet, apiPut } from "@/lib/api";
import { COURIER_NAME, errorMessage } from "@/lib/format";
import type { MarkupRule, MarkupType } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = { percent: "Percentuale %", fixed: "Fisso €" };

export default function MarkupRules() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["admin", "markup"], queryFn: () => apiGet<MarkupRule[]>("/admin/markup-rules") });
  const [draft, setDraft] = useState<MarkupRule[] | null>(null);
  const current = draft ?? (rules.isError ? [] : rules.data ?? []);
  const save = useMutation({
    mutationFn: (r: MarkupRule[]) => apiPut<MarkupRule[]>("/admin/markup-rules", { rules: r }),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "markup"] });
      qc.invalidateQueries({ queryKey: ["quote"] });
      toast.success("Regole di ricarico salvate");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = (i: number, patch: Partial<MarkupRule>) =>
    setDraft(current.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <section data-testid="admin-markup-rules-card" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="font-heading text-lg font-semibold text-navy">Ricarico per corriere (fallback)</h2>
      <p className="text-sm text-muted-foreground">
        Si applica quando il listino non ha un ricarico dedicato. I ricarichi per listino e per cliente si impostano nella tabella sottostante.
      </p>
      <div className="mt-5 space-y-3">
        {current.map((r, i) => (
          <div key={r.courier} data-testid={`admin-markup-row-${r.courier}`} className="flex items-center gap-3 rounded-xl border p-3">
            <CourierLogo courier={r.courier} size="sm" />
            <span className="hidden flex-1 text-sm font-medium text-navy sm:block">{COURIER_NAME[r.courier]}</span>
            <Select value={r.type} onValueChange={(v: string) => update(i, { type: v as MarkupType })}>
              <SelectTrigger data-testid={`admin-markup-type-${r.courier}`} className="h-9 w-36">
                <SelectValue>{(v) => TYPE_LABEL[v as string]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentuale %</SelectItem>
                <SelectItem value="fixed">Fisso €</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              step="0.5"
              aria-label={`Valore ricarico ${r.courier}`}
              data-testid={`admin-markup-value-${r.courier}`}
              value={String(r.value)}
              onChange={(e) => update(i, { value: Number(e.target.value) })}
              className="h-9 w-24 text-right font-mono"
            />
          </div>
        ))}
      </div>
      <Button
        data-testid="admin-markup-save-btn"
        disabled={!draft || save.isPending}
        onClick={() => draft && save.mutate(draft)}
        className="mt-5 h-10 w-full bg-brand font-semibold text-white hover:bg-brand-hover"
      >
        {save.isPending ? "Salvataggio..." : "Salva regole"}
      </Button>
    </section>
  );
}
