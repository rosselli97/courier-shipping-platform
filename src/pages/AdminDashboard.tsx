import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardShell from "@/components/DashboardShell";
import { CourierLogo } from "@/components/brand";
import { apiGet } from "@/lib/api";
import { eur, monthLabel } from "@/lib/format";
import type { AdminKpis, AdminScopeKpis } from "@/lib/types";
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
  const kpis = useQuery({ queryKey: ["admin", "kpis"], queryFn: () => apiGet<AdminKpis>("/admin/kpis") });
  const k = kpis.isError ? undefined : kpis.data;

  return (
    <DashboardShell role="admin" title="Controllo super admin" subtitle="Guadagni separati delle spedizioni interne e delle spedizioni dei clienti B2B.">
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
    </DashboardShell>
  );
}
