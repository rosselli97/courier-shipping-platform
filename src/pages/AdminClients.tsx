import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tags, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { dateIt, errorMessage, eur } from "@/lib/format";
import type { ClientCreate, ClientRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY_CLIENT: ClientCreate = { email: "", company_name: "", vat_number: "", password: "", initial_balance: 0 };

export default function AdminClients() {
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: () => apiGet<ClientRow[]>("/admin/clients") });
  const [walletFor, setWalletFor] = useState<ClientRow | null>(null);
  const [walletAmt, setWalletAmt] = useState("50");
  const [newOpen, setNewOpen] = useState(false);
  const [nc, setNc] = useState<ClientCreate>(EMPTY_CLIENT);

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

  const rows = clients.isError ? [] : clients.data ?? [];
  const active = rows.filter((c) => c.status === "active").length;

  return (
    <DashboardShell
      role="admin"
      title="Controllo clienti B2B"
      subtitle="Clienti, saldi e stati. Listini e ricarichi si gestiscono dalla sezione dedicata."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/listini" data-testid="admin-clients-rate-lists-link" className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2")}>
            <Tags className="size-4" /> Listini e ricarichi
          </Link>
          <Button data-testid="admin-add-client-button" onClick={() => setNewOpen(true)} className="h-11 bg-navy text-white hover:bg-navy-light">
            <Plus className="size-4" /> Nuovo cliente
          </Button>
        </div>
      }
    >
      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-semibold text-navy">Clienti B2B</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-slate-600">
              <Users className="size-3" /> {active} attivi su {rows.length}
            </span>
          </div>
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
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Caricamento...</TableCell></TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={c.id} data-testid={`admin-client-row-${c.email}`} className="hover:bg-muted/50">
                <TableCell className="pl-5">
                  <p className="flex items-center gap-1.5 font-semibold text-navy">
                    <Link
                      to={`/admin/clienti/${c.id}`}
                      data-testid={`admin-client-open-${c.email}`}
                      className="transition-colors hover:text-brand"
                    >
                      {c.company_name}
                    </Link>
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
                <TableCell className="text-right">
                  <Link to={`/admin/clienti/${c.id}`} className="font-semibold text-brand hover:underline">
                    {c.shipments}
                  </Link>
                </TableCell>
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
                  <div className="flex justify-end gap-1.5">
                    <Link
                      to={`/admin/clienti/${c.id}`}
                      data-testid={`admin-client-profile-${c.email}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                    >
                      <UserRound className="size-3.5" /> Profilo
                    </Link>
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

      <Dialog open={walletFor !== null} onOpenChange={(o) => !o && setWalletFor(null)}>
        <DialogContent data-testid="admin-wallet-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">Rettifica saldo</DialogTitle>
            <DialogDescription>
              {walletFor?.company_name} - saldo attuale {walletFor ? eur(walletFor.wallet_balance) : ""}. Usa un valore negativo per addebitare.
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
