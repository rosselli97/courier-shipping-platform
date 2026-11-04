import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "motion/react";
import { CreditCard, History, Loader2, PackageCheck, Plus, Truck, Wallet } from "lucide-react";
import WalletHistorySheet from "@/components/WalletHistorySheet";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardShell from "@/components/DashboardShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage, eur, monthLabel } from "@/lib/format";
import type { CheckoutResponse, PaymentStatus, ResellerSummary, TopUpPackage } from "@/lib/types";
import { cn } from "@/lib/utils";

const PACKAGES: TopUpPackage[] = ["50", "100", "250", "500"];

/** Polls the Stripe session after returning from Checkout; wallet is credited server-side once. */
function usePaymentReturn() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const sessionId = params.get("session_id");
  const notified = useRef<string | null>(null);
  const started = useRef(Date.now());

  useEffect(() => {
    if (params.get("payment") === "cancel") {
      toast.info("Pagamento annullato");
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const status = useQuery({
    queryKey: ["payment", sessionId],
    queryFn: () => apiGet<PaymentStatus>(`/payments/status/${sessionId}`),
    enabled: !!sessionId,
    retry: false,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d && (d.payment_status === "paid" || d.status === "expired")) return false;
      return Date.now() - started.current > 60_000 ? false : 2000;
    },
  });

  useEffect(() => {
    const d = status.data;
    if (!d || notified.current === d.session_id) return;
    if (d.payment_status === "paid") {
      notified.current = d.session_id;
      toast.success(`Ricarica di ${eur(d.amount)} accreditata`, { description: `Nuovo saldo ${eur(d.wallet_balance)}` });
      qc.invalidateQueries({ queryKey: ["reseller"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setParams({}, { replace: true });
    } else if (d.status === "expired") {
      notified.current = d.session_id;
      toast.error("Sessione di pagamento scaduta");
      setParams({}, { replace: true });
    }
  }, [status.data, qc, setParams]);

  useEffect(() => {
    if (status.isError) {
      toast.error("Impossibile verificare il pagamento");
      setParams({}, { replace: true });
    }
  }, [status.isError, setParams]);

  return !!sessionId && !status.isError;
}

function StatCard({ label, value, icon: Icon, testId }: { label: string; value: string; icon: typeof Truck; testId: string }) {
  return (
    <div data-testid={testId} className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="mt-3 font-heading text-3xl font-bold text-navy">{value}</p>
    </div>
  );
}

export default function ResellerDashboard() {
  const [topupOpen, setTopupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pkg, setPkg] = useState<TopUpPackage>("100");
  const confirming = usePaymentReturn();

  const summary = useQuery({ queryKey: ["reseller", "summary"], queryFn: () => apiGet<ResellerSummary>("/reseller/summary") });

  const checkout = useMutation({
    mutationFn: (p: TopUpPackage) =>
      apiPost<CheckoutResponse>("/payments/checkout", { package_id: p, origin_url: window.location.origin }),
    onSuccess: (r) => {
      window.location.href = r.checkout_url;
    },
    onError: (e) => toast.error(errorMessage(e, "Impossibile avviare il pagamento")),
  });

  const sum = summary.isError ? undefined : summary.data;
  const chartData = (sum?.monthly ?? []).map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <DashboardShell
      role="reseller"
      title={sum ? sum.company_name : "Dashboard"}
      subtitle="Gestisci spedizioni, portafoglio e lettere di vettura."
      actions={
        <Link to="/" data-testid="reseller-new-shipment-link" className={cn(buttonVariants(), "h-11 bg-brand px-5 font-semibold text-white hover:bg-brand-hover")}>
          <Plus className="size-4" /> Nuova spedizione
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <motion.div
          data-testid="reseller-wallet-balance-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-lg md:col-span-2 xl:col-span-1"
        >
          <div className="absolute -right-8 -top-8 size-32 rounded-full bg-brand/20 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">Saldo portafoglio</p>
            <Wallet className="size-4 text-brand" />
          </div>
          <p data-testid="reseller-wallet-balance-value" className="relative mt-3 font-heading text-4xl font-bold">
            {sum ? eur(sum.wallet_balance) : "—"}
          </p>
          {confirming ? (
            <p data-testid="reseller-payment-confirming" className="relative mt-4 inline-flex h-9 items-center gap-2 text-sm text-orange-200">
              <Loader2 className="size-4 animate-spin" /> Verifica pagamento…
            </p>
          ) : (
            <div className="relative mt-4 flex flex-wrap gap-2">
              <Button data-testid="reseller-topup-button" onClick={() => setTopupOpen(true)} className="h-9 bg-brand text-white hover:bg-brand-hover">
                <Plus className="size-4" /> Ricarica conto
              </Button>
              <Button data-testid="reseller-wallet-history-button" variant="outline" onClick={() => setHistoryOpen(true)} className="h-9 border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <History className="size-4" /> Movimenti
              </Button>
            </div>
          )}
        </motion.div>
        <StatCard testId="reseller-stat-month-shipments" label="Spedizioni questo mese" value={sum ? String(sum.shipments_this_month) : "—"} icon={Truck} />
        <StatCard testId="reseller-stat-month-spent" label="Speso questo mese" value={sum ? eur(sum.spent_this_month) : "—"} icon={Wallet} />
        <StatCard testId="reseller-stat-in-transit" label="In corso / Consegnate" value={sum ? `${sum.in_transit} / ${sum.delivered}` : "—"} icon={PackageCheck} />
      </div>

      <section data-testid="reseller-shipments-chart" className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-lg font-semibold text-navy">Spedizioni mensili</h2>
          <p className="text-xs text-muted-foreground">Ultimi 6 mesi</p>
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: -20 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                cursor={{ fill: "#FFF2EB" }}
                formatter={(value: number, name: string) => (name === "spent" ? [eur(value), "Speso"] : [value, "Spedizioni"])}
              />
              <Bar dataKey="shipments" fill="#FF5001" radius={[6, 6, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <WalletHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />

      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent data-testid="reseller-topup-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">Ricarica portafoglio</DialogTitle>
            <DialogDescription>Paga con carta in modo sicuro tramite Stripe. Il credito viene accreditato subito dopo il pagamento.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {PACKAGES.map((a) => (
              <Button key={a} variant="outline" data-testid={`reseller-topup-quick-${a}`} onClick={() => setPkg(a)} className={cn("h-14 font-heading text-lg", pkg === a && "border-brand bg-brand-soft text-navy")}>
                {eur(Number(a))}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button data-testid="reseller-topup-confirm-button" disabled={checkout.isPending} onClick={() => checkout.mutate(pkg)} className="h-11 w-full bg-brand text-white hover:bg-brand-hover">
              {checkout.isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
              Paga {eur(Number(pkg))} con carta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
