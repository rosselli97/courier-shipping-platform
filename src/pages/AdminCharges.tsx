import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { eur, errorMessage } from "@/lib/format";
import type { AdminChargeResult } from "@/lib/types";

export default function AdminCharges() {
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const charge = useMutation({
    mutationFn: () =>
      apiPost<AdminChargeResult>("/admin/charges", {
        code: code.trim(),
        amount: Number(amount),
        note: note.trim() || null,
      }),
    onSuccess: (result) => {
      toast.success(`Addebito di ${eur(result.amount)} applicato a ${result.owner_name}`);
    },
    onError: (e) => toast.error(errorMessage(e, "Addebito non riuscito")),
  });

  const result = charge.data;

  return (
    <DashboardShell
      role="admin"
      title="Addebiti manuali"
      subtitle="Inserisci codice o tracking della spedizione e l'importo: l'addebito viene scalato dal saldo del profilo proprietario."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,460px)_1fr] xl:items-start">
        <form
          className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 2 && Number(amount) > 0) charge.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="charge-code">Codice spedizione o tracking</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="charge-code"
                data-testid="charge-code-input"
                value={code}
                onChange={(e) => { setCode(e.target.value); charge.reset(); }}
                placeholder="Es. MVP20260001 oppure TBC-40226"
                className="h-12 pl-9 font-mono"
                required
                minLength={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">Il sistema cerca la spedizione in MUVPACK e, se serve, su TravelBox.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="charge-amount">Importo addebito (€)</Label>
            <Input
              id="charge-amount"
              data-testid="charge-amount-input"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); charge.reset(); }}
              placeholder="10.00"
              className="h-12 text-right font-mono text-lg"
              required
            />
            <p className="text-xs text-muted-foreground">Se il saldo è insufficiente, il credito del profilo andrà in negativo.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="charge-note">Nota (facoltativa)</Label>
            <Input
              id="charge-note"
              data-testid="charge-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motivo dell'addebito"
              className="h-11"
            />
          </div>

          <Button
            type="submit"
            data-testid="charge-apply-button"
            disabled={charge.isPending || code.trim().length < 2 || Number(amount) <= 0}
            className="h-12 w-full gap-2 bg-brand font-semibold text-white hover:bg-brand-hover"
          >
            <Receipt className="size-4" /> {charge.isPending ? "Applico..." : "Applica addebito"}
          </Button>
        </form>

        <div>
          {charge.isError && (
            <div data-testid="charge-error" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Addebito non applicato</div>
              <p className="mt-2">{errorMessage(charge.error, "Spedizione non trovata o addebito non riuscito")}</p>
            </div>
          )}

          {!result && !charge.isError && (
            <div className="flex items-start gap-3 rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
              <Receipt className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <p className="font-semibold text-navy">Come funziona</p>
                <p className="mt-1">Inserisci il codice della spedizione e l'importo. Il sistema trova il profilo proprietario e scala l'importo dal suo saldo. Il saldo può andare sotto zero.</p>
              </div>
            </div>
          )}

          {result && (
            <div data-testid="charge-result" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
              <div className="flex items-center gap-2 font-heading text-lg font-bold text-emerald-900">
                <CheckCircle2 className="size-5" /> Addebito applicato
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p><span className="text-muted-foreground">Spedizione:</span> <span className="font-mono font-semibold text-navy">{result.tracking_code}</span></p>
                <p><span className="text-muted-foreground">Destinatario:</span> {result.recipient_name}</p>
                <p><span className="text-muted-foreground">Profilo:</span> <b className="text-navy">{result.owner_name}</b> ({result.owner_email})</p>
                <p><span className="text-muted-foreground">Ruolo:</span> {result.owner_role}</p>
                <p><span className="text-muted-foreground">Importo:</span> <b className="text-red-700">-{eur(result.amount)}</b></p>
                <p><span className="text-muted-foreground">Saldo:</span> {eur(result.previous_balance)} → <b className={result.new_balance < 0 ? "text-red-700" : "text-emerald-800"}>{eur(result.new_balance)}</b></p>
                {result.note && <p><span className="text-muted-foreground">Nota:</span> {result.note}</p>}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">L'addebito è registrato nei movimenti del profilo.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
