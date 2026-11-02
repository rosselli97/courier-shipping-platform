import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import CalculatorForm, { type CalcValues } from "@/components/CalculatorForm";
import CourierSelectionList from "@/components/couriers/CourierSelectionList";
import ShipmentDialog from "@/components/ShipmentDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiPost } from "@/lib/api";
import type { CourierQuote, MarkupType, QuoteRequest, QuoteResponse } from "@/lib/types";

const toReq = (v: CalcValues): QuoteRequest => ({
  origin_cap: v.o, dest_cap: v.d, origin_city: v.oc || null, dest_city: v.dc || null, weight_kg: Number(v.w), length_cm: Number(v.l), width_cm: Number(v.wi), height_cm: Number(v.h),
  pieces: Number(v.n), is_pallet: v.p === "1", source: "travelbox",
});

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default function AdminNewShipment() {
  const [req, setReq] = useState<QuoteRequest | null>(null);
  const [selected, setSelected] = useState<CourierQuote | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [applyMarkup, setApplyMarkup] = useState(false);
  const [markupType, setMarkupType] = useState<MarkupType>("percent");
  const [markupValue, setMarkupValue] = useState("0");
  const quote = useQuery({
    queryKey: ["quote", "admin", req],
    queryFn: () => apiPost<QuoteResponse>("/quote", req),
    enabled: req !== null,
    retry: false,
  });

  const markupAmount = Math.max(0, Number(markupValue) || 0);
  const displayQuotes = useMemo(
    () =>
      (quote.data?.quotes ?? []).map((q) => {
        const base = round2(q.base_cost + q.fuel_surcharge);
        const markup = applyMarkup
          ? round2(markupType === "percent" ? (base * markupAmount) / 100 : markupAmount)
          : 0;
        return { ...q, price: round2(base + markup), markup };
      }),
    [quote.data?.quotes, applyMarkup, markupType, markupAmount],
  );

  return (
    <DashboardShell role="admin" title="Nuova spedizione" subtitle="Compila i campi e decidi il ricarico da applicare alla spedizione.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_1fr] xl:items-start">
        <CalculatorForm onSubmit={(v, c) => { setReq(toReq(v)); setContactId(c); }} />
        <div data-testid="admin-new-shipment-results">
          {!req && (
            <div className="flex items-start gap-3 rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-brand" />
              Inserisci CAP, peso e dimensioni e premi "Confronta corrieri": vedrai le offerte reali TravelBox per la tratta.
            </div>
          )}
          {req && quote.isPending && (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
          )}
          {req && quote.isError && (
            <div data-testid="admin-quote-error" className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              Impossibile calcolare la tariffa. Controlla i dati del pacco.
            </div>
          )}
          {req && quote.data && !quote.isError && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {quote.data.origin_city} → {quote.data.dest_city} · {req.pieces} colli, peso tassabile <b className="text-navy">{quote.data.billable_weight_kg} kg</b>
                {quote.data.provider === "travelbox" ? " · prezzi reali TravelBox (IVA inclusa)" : " · prezzi a costo"}
                {quote.data.is_pallet && <> · <b className="text-navy">Pallet, {quote.data.pallet_zone}</b></>}
              </p>
              {quote.data.notice && (
                <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{quote.data.notice}</p>
              )}
              <div data-testid="admin-markup-panel" className="mb-4 rounded-2xl border bg-card p-4 shadow-sm">
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    data-testid="admin-apply-markup-checkbox"
                    checked={applyMarkup}
                    onCheckedChange={(v) => setApplyMarkup(!!v)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-navy">Applica ricarico</span>
                    <span className="block text-xs text-muted-foreground">Scegli se e quanto ricaricare le offerte di questa spedizione.</span>
                  </span>
                </label>
                {applyMarkup && (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="w-40 space-y-1.5">
                      <Label>Tipologia</Label>
                      <Select value={markupType} onValueChange={(v: string) => setMarkupType(v as MarkupType)}>
                        <SelectTrigger data-testid="admin-markup-type-select" className="h-10">
                          <SelectValue>{(v) => (v === "percent" ? "Percentuale %" : "Fisso €")}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">Percentuale %</SelectItem>
                          <SelectItem value="fixed">Fisso €</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-32 space-y-1.5">
                      <Label>Valore</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        data-testid="admin-markup-value-input"
                        value={markupValue}
                        onChange={(e) => setMarkupValue(e.target.value)}
                        className="h-10 text-right font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
              <CourierSelectionList quotes={displayQuotes} onSelect={setSelected} />
            </>
          )}
        </div>
      </div>
      {req && (
        <ShipmentDialog
          quote={selected}
          request={req}
          role="admin"
          prefillContactId={contactId}
          sender={quote.data?.sender}
          markup={applyMarkup ? { apply: true, type: markupType, value: markupAmount } : { apply: false, type: markupType, value: 0 }}
          onClose={() => setSelected(null)}
        />
      )}
    </DashboardShell>
  );
}
