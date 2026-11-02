import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardShell from "@/components/DashboardShell";
import { CourierLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api";
import { dateIt, errorMessage, eur, monthLabel } from "@/lib/format";
import type { AdminKpis, AdminScopeKpis, AdminWallet } from "@/lib/types";
import { cn } from "@/lib/utils";

function MiniStat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div data-testid={testId} className="rounded-xl border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-lg font-bold text-navy">{value}</p>
    </div>
  );
}

function RevenueChart({ data, id, testId }: { data: AdminScopeKpis["monthly"]; id: string; testId: string }) {
  const chart = data.map((m) => ({ ...m, label: monthLabel(m.month) }));
  return (
    <div data-testid={testId} className="mt-5 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{ left: -10 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF5001" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#FF5001" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} />
          <Tooltip formatter={(value: number, name: string) => [eur(value), name === "revenue" ? "Ricavi" : "Costi"]} />
          <Area type="monotone" dataKey="revenue" stroke="#FF5001" strokeWidth={2.5} fill={`url(#${id})`} />
          <Area type="monotone" dataKey="costs" stroke="#03304D" strokeWidth={2} fill="transparent" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScopePanel({ title, subtitle, data, testId, tone }: {
  title: string;
  subtitle: string;
  data?: AdminScopeKpis;
  testId: string;
  tone: "admin" | "clients";
}) {
  const accent = tone === "admin";
  return (
    <section data-testid={testId} className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-navy">
            {accent ? <ShieldCheck className="size-5 text-brand" /> : <Users className="size-5 text-brand" />}
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guadagno netto</p>
          <p className={cn("font-heading text-3xl font-bold", accent ? "text-brand" : "text-navy")}>{data ? eur(data.profit) : "-"}</p>
          <p className="text-xs text-muted-foreground">{data ? `${data.margin_pct.toLocaleString("it-IT")}% margine` : ""}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Ricavi" value={data ? eur(data.revenue) : "-"} testId={`${testId}-revenue`} />
        <MiniStat label="Costi corrieri" value={data ? eur(data.costs) : "-"} testId={`${testId}-costs`} />
        <MiniStat label="Spedizioni" value={data ? String(data.shipments) : "-"} testId={`${testId}-shipments`} />
        <MiniStat label="Utile netto" value={data ? eur(data.profit) : "-"} testId={`${testId}-profit`} />
      </div>
      <RevenueChart data={data?.monthly ?? []} id={`rev-${tone}`} testId={`${testId}-chart`} />
      <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
        {(data?.by_courier ?? []).map((c) => (
          <div key={c.courier} data-testid={`${testId}-courier-${c.courier}`} className="flex items-center gap-2">
            <CourierLogo courier={c.courier} size="sm" />
            <div className="text-xs">
              <p className="font-semibold text-navy">{c.shipments} sped.</p>
              <p className="text-muted-foreground">{eur(c.revenue)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminDashboard() {
  const qc = useQueryClient();
  const kpis = useQuery({ queryKey: ["admin", "kpis"], queryFn: () => apiGet<AdminKpis>("/admin/kpis") });
  const wallet = useQuery({ queryKey: ["admin", "wallet"], queryFn: () => apiGet<AdminWallet>("/admin/wallet") });
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("100");
  const k = kpis.isError ? undefined : kpis.data;
  const topup = useMutation({
    mutationFn: () => apiPost<AdminWallet>("/admin/wallet/topup", { amount: Number(topupAmount), note: "Ricarica conto super admin" }),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ["admin", "wallet"] });
      setTopupOpen(false);
      toast.success(`Conto ricaricato: ${eur(w.balance)}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <DashboardShell role="admin" title="Controllo super admin" subtitle="Guadagni separati delle spedizioni interne e dei clienti B2B, con ricarica del conto.">
      <section data-testid="admin-wallet-card" className="mb-6 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conto super admin</p>
            <p className="mt-1 font-heading text-3xl font-bold text-navy">{wallet.data ? eur(wallet.data.balance) : "-"}</p>
            <p className="text-xs text-muted-foreground">Saldo disponibile sul conto dell'amministratore.</p>
          </div>
          <Button
            data-testid="admin-wallet-topup-button"
            onClick={() => { setTopupAmount("100"); setTopupOpen(true); }}
            className="h-11 bg-brand text-white hover:bg-brand-hover"
          >
            <Wallet className="size-4" /> Ricarica conto
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ScopePanel
          title="Spedizioni super admin"
          subtitle="Guadagni delle sole spedizioni create dal super admin."
          data={k?.admin}
          testId="admin-scope"
          tone="admin"
        />
        <ScopePanel
          title="Spedizioni clienti B2B"
          subtitle={`Guadagni delle spedizioni create dai clienti B2B${k ? ` · ${k.active_clients} attivi` : ""}.`}
          data={k?.clients}
          testId="clients-scope"
          tone="clients"
        />
      </div>

      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent data-testid="admin-wallet-topup-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">Ricarica conto super admin</DialogTitle>
            <DialogDescription>
              Saldo attuale {wallet.data ? eur(wallet.data.balance) : "-"}. L'importo viene accreditato subito.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            data-testid="admin-wallet-topup-input"
            aria-label="Importo ricarica"
            value={topupAmount}
            onChange={(e) => setTopupAmount(e.target.value)}
            className="h-11"
          />
          {wallet.data?.transactions?.length ? (
            <div className="max-h-40 overflow-auto rounded-xl border bg-muted/30 p-2">
              {wallet.data.transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
                  <span className="truncate text-muted-foreground">{tx.note || tx.type} · {dateIt(tx.created_at)}</span>
                  <span className={tx.amount >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{eur(tx.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              data-testid="admin-wallet-topup-confirm"
              disabled={!topupAmount || Number(topupAmount) <= 0 || topup.isPending}
              onClick={() => topup.mutate()}
              className="h-11 w-full bg-brand text-white hover:bg-brand-hover"
            >
              Ricarica {eur(Number(topupAmount) || 0)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
