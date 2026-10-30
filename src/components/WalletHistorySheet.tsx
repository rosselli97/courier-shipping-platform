import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CreditCard, Download, FileSpreadsheet, FileText, Gift, Package } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";
import { API_BASE, apiGet } from "@/lib/api";
import { dateTimeIt, eur } from "@/lib/format";
import type { WalletTx } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTHS_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const monthLong = (ym: string) => (ym ? `${MONTHS_IT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "—");

type Filter = "all" | "in" | "out";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tutti" },
  { id: "in", label: "Ricariche" },
  { id: "out", label: "Addebiti" },
];

function describe(t: WalletTx): { title: string; icon: typeof Package } {
  switch (t.type) {
    case "shipment":
      return { title: "Spedizione", icon: Package };
    case "stripe_topup":
    case "topup":
      return { title: "Ricarica con carta", icon: CreditCard };
    default:
      return { title: t.note || (t.amount >= 0 ? "Accredito amministrazione" : "Addebito amministrazione"), icon: Gift };
  }
}

export default function WalletHistorySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const txs = useQuery({
    queryKey: ["reseller", "wallet-tx"],
    queryFn: () => apiGet<WalletTx[]>("/reseller/wallet/transactions"),
    enabled: open,
  });

  const list = txs.isError ? [] : txs.data ?? [];
  const rows = useMemo(
    () => list.filter((t) => filter === "all" || (filter === "in" ? t.amount > 0 : t.amount < 0)),
    [list, filter],
  );
  const totIn = list.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const totOut = list.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0);
  // months that have movements, newest first (YYYY-MM, Italian time)
  const months = useMemo(() => {
    const set = new Set(
      list.map((t) => {
        const d = new Date(t.created_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
        return d.slice(0, 7);
      }),
    );
    return [...set].sort().reverse();
  }, [list]);
  const [month, setMonth] = useState("");
  const selectedMonth = month || months[0] || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="wallet-history-sheet" side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="font-heading text-xl text-navy">Movimenti portafoglio</SheetTitle>
          <SheetDescription>Ricariche, addebiti per spedizione e rettifiche, con il saldo dopo ogni movimento.</SheetDescription>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Entrate</p>
              <p data-testid="wallet-history-total-in" className="font-heading text-lg font-bold text-emerald-800">{eur(totIn)}</p>
            </div>
            <div className="rounded-xl bg-brand-soft px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B53900]">Uscite</p>
              <p data-testid="wallet-history-total-out" className="font-heading text-lg font-bold text-navy">{eur(Math.abs(totOut))}</p>
            </div>
          </div>
          <div className="mt-3 inline-flex w-fit rounded-lg bg-muted p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                data-testid={`wallet-history-filter-${f.id}`}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === f.id ? "bg-white text-navy shadow-sm" : "text-muted-foreground hover:text-navy",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {months.length > 0 && (
            <div data-testid="wallet-statement-section" className="mt-3 rounded-xl border border-dashed p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="size-3.5" /> Estratto conto mensile
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Select value={selectedMonth} onValueChange={(v: string) => setMonth(v)}>
                  <SelectTrigger data-testid="wallet-statement-month-select" className="h-9 min-w-0 flex-1 bg-white">
                    <SelectValue>{(v) => monthLong(v as string)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m} data-testid={`wallet-statement-month-${m}`}>{monthLong(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <a
                  href={`${API_BASE}/reseller/wallet/statement?month=${selectedMonth}&format=pdf`}
                  download
                  data-testid="wallet-statement-download-pdf"
                  onClick={() => toast.success(`Estratto conto ${monthLong(selectedMonth)} (PDF) in download`)}
                  className={cn(buttonVariants({ size: "sm" }), "h-9 bg-navy text-white hover:bg-navy-light")}
                >
                  <Download className="size-3.5" /> PDF
                </a>
                <a
                  href={`${API_BASE}/reseller/wallet/statement?month=${selectedMonth}&format=xlsx`}
                  download
                  data-testid="wallet-statement-download-xlsx"
                  onClick={() => toast.success(`Estratto conto ${monthLong(selectedMonth)} (Excel) in download`)}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 hover:border-emerald-600 hover:text-emerald-700")}
                >
                  <FileSpreadsheet className="size-3.5" /> Excel
                </a>
              </div>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-2" data-testid="wallet-history-list">
          {txs.isPending && open && (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}
            </div>
          )}
          {!txs.isPending && rows.length === 0 && (
            <p data-testid="wallet-history-empty" className="p-8 text-center text-sm text-muted-foreground">Nessun movimento.</p>
          )}
          <ul>
            {rows.map((t) => {
              const d = describe(t);
              const positive = t.amount > 0;
              return (
                <li key={t.id} data-testid="wallet-history-item" className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", positive ? "bg-emerald-50 text-emerald-700" : "bg-brand-soft text-brand")}>
                    {positive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
                      <d.icon className="size-3.5 text-slate-400" /> {d.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dateTimeIt(t.created_at)}
                      {t.type === "shipment" && t.ref && (
                        <>
                          {" · "}
                          <Link
                            to={`/traccia/${t.ref}`}
                            data-testid="wallet-history-shipment-ref"
                            className="font-mono font-semibold text-navy underline-offset-2 hover:text-brand hover:underline"
                          >
                            {t.ref}
                          </Link>
                        </>
                      )}
                      {t.type !== "shipment" && t.ref && <span className="font-mono"> · Rif. {t.ref.slice(-8)}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p data-testid="wallet-history-amount" className={cn("font-heading text-sm font-bold", positive ? "text-emerald-700" : "text-navy")}>
                      {positive ? "+" : "−"}{eur(Math.abs(t.amount))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Saldo {eur(t.balance_after)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
