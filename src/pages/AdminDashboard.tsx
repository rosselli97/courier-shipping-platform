import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Coins, Percent, Receipt, Users } from "lucide-react";
import PalletRates from "@/components/PalletRates";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardShell from "@/components/DashboardShell";
import { CourierLogo } from "@/components/brand";
import { apiGet } from "@/lib/api";
import { eur, monthLabel } from "@/lib/format";
import type { AdminKpis } from "@/lib/types";
import { cn } from "@/lib/utils";

function Kpi({ label, value, hint, icon: Icon, testId, accent, delay }: {
  label: string; value: string; hint: string; icon: typeof Coins; testId: string; accent?: boolean; delay: number;
}) {
  return (
    <motion.div
      data-testid={testId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn("relative overflow-hidden rounded-2xl border p-6 shadow-sm", accent ? "border-transparent bg-navy text-white" : "bg-card")}
    >
      {accent && <div className="absolute -right-10 -top-10 size-40 rounded-full bg-brand/25 blur-3xl" />}
      <div className="relative flex items-center justify-between">
        <p className={cn("text-sm font-medium", accent ? "text-slate-300" : "text-muted-foreground")}>{label}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", accent ? "bg-brand text-white" : "bg-brand-soft text-brand")}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("relative mt-4 font-heading text-4xl font-bold", accent ? "text-white" : "text-navy")}>{value}</p>
      <p className={cn("relative mt-1 text-xs", accent ? "text-slate-300" : "text-muted-foreground")}>{hint}</p>
    </motion.div>
  );
}

export default function AdminDashboard() {
  const kpis = useQuery({ queryKey: ["admin", "kpis"], queryFn: () => apiGet<AdminKpis>("/admin/kpis") });
  const k = kpis.isError ? undefined : kpis.data;
  const chart = (k?.monthly ?? []).map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <DashboardShell role="admin" title="Controllo super admin" subtitle="KPI, ricavi, costi e tariffe pallet.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi testId="admin-kpi-revenue" label="Ricavi totali" value={k ? eur(k.total_revenue) : "-"} hint={k ? `${k.total_shipments} spedizioni` : ""} icon={Coins} delay={0} />
        <Kpi testId="admin-kpi-carrier-costs" label="Costi corrieri" value={k ? eur(k.courier_costs) : "-"} hint="Tariffe + supplemento carburante" icon={Receipt} delay={0.06} />
        <Kpi testId="admin-kpi-net-margin" label="Margine netto" value={k ? `${k.net_margin_pct.toLocaleString("it-IT")}%` : "-"} hint={k ? `Utile netto ${eur(k.net_profit)}` : ""} icon={Percent} accent delay={0.12} />
        <Kpi testId="admin-kpi-active-clients" label="Clienti B2B attivi" value={k ? String(k.active_clients) : "-"} hint="Account abilitati" icon={Users} delay={0.18} />
      </div>

      <section data-testid="admin-revenue-chart" className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-navy">Ricavi vs costi</h2>
          <span className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand" />Ricavi</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-navy" />Costi</span>
          </span>
        </div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ left: -10 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF5001" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FF5001" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip formatter={(value: number, name: string) => [eur(value), name === "revenue" ? "Ricavi" : "Costi"]} />
              <Area type="monotone" dataKey="revenue" stroke="#FF5001" strokeWidth={2.5} fill="url(#rev)" />
              <Area type="monotone" dataKey="costs" stroke="#03304D" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
          {(k?.by_courier ?? []).map((c) => (
            <div key={c.courier} data-testid={`admin-courier-split-${c.courier}`} className="flex items-center gap-2">
              <CourierLogo courier={c.courier} size="sm" />
              <div className="text-xs">
                <p className="font-semibold text-navy">{c.shipments} sped.</p>
                <p className="text-muted-foreground">{eur(c.revenue)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6">
        <PalletRates />
      </div>
    </DashboardShell>
  );
}
