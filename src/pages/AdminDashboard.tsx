import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Coins, Percent, Plus, Receipt, Tags, TrendingUp, Users, Wallet } from "lucide-react";
import ClientPriceListDialog from "@/components/ClientPriceListDialog";
import PalletRates from "@/components/PalletRates";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardShell from "@/components/DashboardShell";
import { CourierLogo } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { COURIER_NAME, dateIt, errorMessage, eur, monthLabel } from "@/lib/format";
import type { AdminKpis, ClientCreate, ClientRow, MarkupRule, MarkupType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = { percent: "Percentuale %", fixed: "Fisso €" };

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

function MarkupRules() {
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
    <section id="regole" data-testid="admin-markup-rules-card" className="scroll-mt-28 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="font-heading text-lg font-semibold text-navy">Regole di ricarico standard</h2>
      <p className="text-sm text-muted-foreground">Margine applicato al costo corriere. Puoi personalizzarlo per singolo cliente dal pulsante «Listino».</p>
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
        {save.isPending ? "Salvataggio…" : "Salva regole"}
      </Button>
    </section>
  );
}

const EMPTY_CLIENT: ClientCreate = { email: "", company_name: "", vat_number: "", password: "", initial_balance: 0 };

export default function AdminDashboard() {
  const qc = useQueryClient();
  const kpis = useQuery({ queryKey: ["admin", "kpis"], queryFn: () => apiGet<AdminKpis>("/admin/kpis") });
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: () => apiGet<ClientRow[]>("/admin/clients") });
  const [walletFor, setWalletFor] = useState<ClientRow | null>(null);
  const [priceFor, setPriceFor] = useState<ClientRow | null>(null);
  const [walletAmt, setWalletAmt] = useState("50");
  const [newOpen, setNewOpen] = useState(false);
  const [nc, setNc] = useState<ClientCreate>(EMPTY_CLIENT);
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [location.hash]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const toggle = useMutation({
    mutationFn: (c: ClientRow) =>
      apiPatch<ClientRow>(`/admin/clients/${c.id}/status`, { status: c.status === "active" ? "suspended" : "active" }),
    onSuccess: (c) => {
      refresh();
      toast.success(`${c.company_name}: ${c.status === "active" ? "attivato" : "sospeso"}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const adjust = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => apiPost<ClientRow>(`/admin/clients/${id}/wallet`, { amount }),
    onSuccess: (c) => {
      refresh();
      setWalletFor(null);
      toast.success(`Saldo ${c.company_name}: ${eur(c.wallet_balance)}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const create = useMutation({
    mutationFn: (body: ClientCreate) => apiPost<ClientRow>("/admin/clients", body),
    onSuccess: (c) => {
      refresh();
      setNewOpen(false);
      setNc(EMPTY_CLIENT);
      toast.success(`Cliente ${c.company_name} creato`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const k = kpis.isError ? undefined : kpis.data;
  const chart = (k?.monthly ?? []).map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <DashboardShell
      role="admin"
      title="Panoramica"
      subtitle="Monitora performance, ricarichi e clienti B2B."
      actions={
        <Link to="/admin/nuova-spedizione" className={cn(buttonVariants(), "h-11 bg-brand px-5 font-semibold text-white hover:bg-brand-hover")}>
          <Plus className="size-4" /> Nuova spedizione
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi testId="admin-kpi-revenue" label="Ricavi totali" value={k ? eur(k.total_revenue) : "—"} hint={k ? `${k.total_shipments} spedizioni` : ""} icon={Coins} delay={0} />
        <Kpi testId="admin-kpi-carrier-costs" label="Costi corrieri" value={k ? eur(k.courier_costs) : "—"} hint="Tariffe + supplemento carburante" icon={Receipt} delay={0.06} />
        <Kpi testId="admin-kpi-net-margin" label="Margine netto" value={k ? `${k.net_margin_pct.toLocaleString("it-IT")}%` : "—"} hint={k ? `Utile netto ${eur(k.net_profit)}` : ""} icon={Percent} accent delay={0.12} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section data-testid="admin-revenue-chart" className="rounded-2xl border bg-card p-6 shadow-sm">
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
        <MarkupRules />
      </div>

      <div className="mt-6">
        <PalletRates />
      </div>

      <section id="clienti" className="mt-6 scroll-mt-28 rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-semibold text-navy">Clienti B2B</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-slate-600">
              <Users className="size-3" /> {k?.active_clients ?? "—"} attivi
            </span>
          </div>
          <Button data-testid="admin-add-client-button" onClick={() => setNewOpen(true)} className="h-10 bg-navy text-white hover:bg-navy-light">
            <Plus className="size-4" /> Nuovo cliente
          </Button>
        </div>
        <Table data-testid="admin-b2b-clients-table">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Azienda</TableHead>
              <TableHead>P. IVA</TableHead>
              <TableHead className="text-right">Spedizioni</TableHead>
              <TableHead className="text-right">Fatturato</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Cliente dal</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="pr-5 text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.isPending && (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Caricamento…</TableCell></TableRow>
            )}
            {(clients.isError ? [] : clients.data ?? []).map((c) => (
              <TableRow key={c.id} data-testid={`admin-client-row-${c.email}`} className="hover:bg-muted/50">
                <TableCell className="pl-5">
                  <p className="flex items-center gap-1.5 font-semibold text-navy">
                    {c.company_name}
                    {c.self_registered && (
                      <span data-testid="admin-client-self-registered-badge" className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                        Registrato online
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                  {(c.contact_name || c.phone) && (
                    <p data-testid="admin-client-contact" className="text-xs text-muted-foreground">
                      {[c.contact_name, c.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{c.vat_number}</TableCell>
                <TableCell className="text-right">{c.shipments}</TableCell>
                <TableCell className="text-right">{eur(c.revenue)}</TableCell>
                <TableCell data-testid="admin-client-wallet-value" className="text-right font-semibold text-navy">{eur(c.wallet_balance)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{dateIt(c.created_at)}</TableCell>
                <TableCell>
                  <button
                    data-testid="admin-client-status-toggle"
                    onClick={() => toggle.mutate(c)}
                    disabled={toggle.isPending}
                    aria-label={c.status === "active" ? "Sospendi cliente" : "Attiva cliente"}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                      c.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                    )}
                  >
                    <span className={cn("relative h-3.5 w-6 rounded-full transition-colors", c.status === "active" ? "bg-emerald-500" : "bg-red-300")}>
                      <span className={cn("absolute top-0.5 size-2.5 rounded-full bg-white transition-[left]", c.status === "active" ? "left-3" : "left-0.5")} />
                    </span>
                    {c.status === "active" ? "Attivo" : "Sospeso"}
                  </button>
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="admin-client-price-list-btn"
                      onClick={() => setPriceFor(c)}
                      className={cn(c.custom_markups > 0 && "border-brand/50 text-brand")}
                    >
                      <Tags className="size-3.5" /> Listino
                      {c.custom_markups > 0 && (
                        <span data-testid="admin-client-custom-badge" className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                          {c.custom_markups}
                        </span>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" data-testid="admin-client-wallet-adjust-btn" onClick={() => { setWalletFor(c); setWalletAmt("50"); }}>
                      <Wallet className="size-3.5" /> Saldo
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <ClientPriceListDialog client={priceFor} onClose={() => setPriceFor(null)} />

      <Dialog open={walletFor !== null} onOpenChange={(o) => !o && setWalletFor(null)}>
        <DialogContent data-testid="admin-wallet-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">Rettifica saldo</DialogTitle>
            <DialogDescription>
              {walletFor?.company_name} — saldo attuale {walletFor ? eur(walletFor.wallet_balance) : ""}. Usa un valore negativo per addebitare.
            </DialogDescription>
          </DialogHeader>
          <Input type="number" step="0.01" data-testid="admin-wallet-amount-input" aria-label="Importo rettifica" value={walletAmt} onChange={(e) => setWalletAmt(e.target.value)} className="h-11" />
          <DialogFooter>
            <Button
              data-testid="admin-wallet-confirm-button"
              disabled={!walletAmt || Number(walletAmt) === 0 || adjust.isPending}
              onClick={() => walletFor && adjust.mutate({ id: walletFor.id, amount: Number(walletAmt) })}
              className="h-11 w-full bg-brand text-white hover:bg-brand-hover"
            >
              <TrendingUp className="size-4" /> Applica rettifica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent data-testid="admin-new-client-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">Nuovo cliente B2B</DialogTitle>
            <DialogDescription>Crea un account rivenditore con accesso alla piattaforma.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(nc);
            }}
          >
            {([
              ["company_name", "Ragione sociale", "text"],
              ["vat_number", "Partita IVA", "text"],
              ["email", "Email", "email"],
              ["password", "Password iniziale", "text"],
            ] as const).map(([key, label, type]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`nc-${key}`}>{label}</Label>
                <Input id={`nc-${key}`} type={type} required data-testid={`admin-new-client-${key.replace("_", "-")}-input`} value={nc[key]} onChange={(e) => setNc({ ...nc, [key]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="nc-bal">Credito iniziale (€)</Label>
              <Input id="nc-bal" type="number" min="0" data-testid="admin-new-client-balance-input" value={String(nc.initial_balance)} onChange={(e) => setNc({ ...nc, initial_balance: Number(e.target.value) })} />
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="admin-new-client-submit-button" disabled={create.isPending} className="h-11 w-full bg-brand text-white hover:bg-brand-hover">
                Crea cliente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
