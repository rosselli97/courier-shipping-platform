import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CourierLogo } from "@/components/brand";
import { apiGet, apiPut } from "@/lib/api";
import { COURIER_NAME, errorMessage } from "@/lib/format";
import type { ClientMarkup, ClientRow, CourierId, MarkupRule, MarkupType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = { percent: "Percentuale %", fixed: "Fisso €" };
const ruleText = (r: MarkupRule) => (r.type === "percent" ? `+${r.value}%` : `+${r.value.toFixed(2)} €`);

interface Row extends MarkupRule {
  custom: boolean;
}

function Editor({ client, data, onClose }: { client: ClientRow; data: ClientMarkup; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() =>
    data.standard.map((s) => {
      const o = data.overrides.find((x) => x.courier === s.courier);
      return o ? { ...o, custom: true } : { ...s, custom: false };
    }),
  );
  const std = (c: CourierId) => data.standard.find((s) => s.courier === c)!;
  const update = (c: CourierId, patch: Partial<Row>) => setRows(rows.map((r) => (r.courier === c ? { ...r, ...patch } : r)));

  const save = useMutation({
    mutationFn: (overrides: MarkupRule[]) => apiPut<ClientMarkup>(`/admin/clients/${client.id}/markup`, { overrides }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "clients"] });
      qc.invalidateQueries({ queryKey: ["admin", "client-markup", client.id] });
      toast.success(
        r.overrides.length ? `Listino personalizzato salvato per ${client.company_name}` : `${client.company_name} usa il listino standard`,
      );
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.courier}
            data-testid={`client-markup-row-${r.courier}`}
            className={cn("rounded-xl border p-3 transition-colors", r.custom && "border-brand/40 bg-brand-soft/50")}
          >
            <div className="flex items-center gap-3">
              <CourierLogo courier={r.courier} size="sm" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-navy">{COURIER_NAME[r.courier]}</p>
                <p className="text-xs text-muted-foreground">Standard: {ruleText(std(r.courier))}</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-navy">
                <Checkbox
                  data-testid={`client-markup-custom-${r.courier}`}
                  checked={r.custom}
                  onCheckedChange={(v) => update(r.courier, v ? { custom: true } : { ...std(r.courier), custom: false })}
                />
                Personalizza
              </label>
            </div>
            {r.custom && (
              <div className="mt-3 flex gap-2">
                <Select value={r.type} onValueChange={(v: string) => update(r.courier, { type: v as MarkupType })}>
                  <SelectTrigger data-testid={`client-markup-type-${r.courier}`} className="h-9 flex-1 bg-white">
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
                  aria-label={`Ricarico personalizzato ${r.courier}`}
                  data-testid={`client-markup-value-${r.courier}`}
                  value={String(r.value)}
                  onChange={(e) => update(r.courier, { value: Number(e.target.value) })}
                  className="h-9 w-28 bg-white text-right font-mono"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          variant="ghost"
          data-testid="client-markup-reset-button"
          disabled={save.isPending || !data.overrides.length}
          onClick={() => save.mutate([])}
        >
          Ripristina standard
        </Button>
        <Button
          data-testid="client-markup-save-button"
          disabled={save.isPending}
          onClick={() => save.mutate(rows.filter((r) => r.custom).map(({ courier, type, value }) => ({ courier, type, value })))}
          className="bg-brand text-white hover:bg-brand-hover"
        >
          Salva listino
        </Button>
      </DialogFooter>
    </>
  );
}

export default function ClientPriceListDialog({ client, onClose }: { client: ClientRow | null; onClose: () => void }) {
  const markup = useQuery({
    queryKey: ["admin", "client-markup", client?.id],
    queryFn: () => apiGet<ClientMarkup>(`/admin/clients/${client!.id}/markup`),
    enabled: client !== null,
  });
  return (
    <Dialog open={client !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="client-price-list-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-navy">Listino cliente</DialogTitle>
          <DialogDescription>
            {client?.company_name}: imposta un ricarico dedicato per corriere. Le voci non personalizzate seguono il listino standard.
          </DialogDescription>
        </DialogHeader>
        {client && markup.data && !markup.isError ? (
          <Editor key={client.id + markup.dataUpdatedAt} client={client} data={markup.data} onClose={onClose} />
        ) : (
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        )}
      </DialogContent>
    </Dialog>
  );
}
