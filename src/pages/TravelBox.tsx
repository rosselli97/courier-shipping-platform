import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Truck } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/format";
import {
  tbCart,
  tbHealth,
  tbLabelGroups,
  tbLabelHref,
  tbMergeLabels,
  tbMoney,
  tbShipments,
  type TravelBoxShipment,
} from "@/lib/travelbox";
import { cn } from "@/lib/utils";

const YEAR = new Date().getFullYear();

export default function TravelBox() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(`${YEAR}-01-01`);
  const [dateTo, setDateTo] = useState(`${YEAR}-12-31`);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState("");

  const health = useQuery({ queryKey: ["tb", "health"], queryFn: tbHealth, retry: false, staleTime: 60_000 });
  const online = health.data?.logged_in === true;

  const groups = useQuery({ queryKey: ["tb", "groups"], queryFn: tbLabelGroups, enabled: online, retry: false });
  const shipments = useQuery({
    queryKey: ["tb", "shipments", page, dateFrom, dateTo, refresh],
    queryFn: () => tbShipments({ page, dateFrom, dateTo, refresh: refresh > 0 }),
    enabled: online,
    retry: false,
  });
  const cart = useQuery({
    queryKey: ["tb", "cart", refresh],
    queryFn: () => tbCart(refresh > 0),
    enabled: online,
    retry: false,
  });

  useEffect(() => {
    if (!groupId && groups.data?.[0]?.id) setGroupId(groups.data[0].id);
  }, [groupId, groups.data]);

  const mergeMutation = useMutation({
    mutationFn: () => tbMergeLabels([...selected], groupId),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "etichette-travelbox.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF etichette pronto");
    },
    onError: (e) => toast.error(errorMessage(e, "Unione etichette non riuscita")),
  });

  const refreshAll = () => {
    setRefresh((n) => n + 1);
    qc.invalidateQueries({ queryKey: ["tb"] });
    toast.success("Dati TravelBox aggiornati");
  };

  const rows = shipments.data ?? [];
  const cartRows = cart.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => r.id && selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => r.id && next.delete(r.id));
      else rows.forEach((r) => r.id && next.add(r.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <DashboardShell
      role="admin"
      title="TravelBox"
      subtitle="Storico spedizioni, carrello ed etichette PDF dal portale TravelBox Contorno."
      actions={
        <Button onClick={refreshAll} variant="outline" className="h-11 gap-2">
          <RefreshCw className="size-4" /> Aggiorna
        </Button>
      }
    >
      <div className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-5 text-sm">
        <Truck className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <p className="font-semibold text-navy">Prezzi reali direttamente nel flusso MUVPACK</p>
          <p className="text-muted-foreground">
            I preventivi TravelBox si calcolano dalla pagina «Scegli il corriere» e da «Nuova spedizione» usando gli stessi campi
            di MUVPACK (CAP, peso, dimensioni, pallet). Qui gestisci storico, carrello ed etichette.
          </p>
        </div>
      </div>

      {health.isPending && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-brand" /> Connessione al portale TravelBox…
        </div>
      )}

      {health.isError && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Portale non raggiungibile</p>
            <p>{errorMessage(health.error, "Controlla le credenziali TravelBox su Render.")}</p>
          </div>
        </div>
      )}

      {health.data && !health.data.logged_in && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Login TravelBox non riuscito</p>
            <p>{health.data.detail || "Verifica TRAVELBOX_USERID e TRAVELBOX_PASSWORD nelle env vars di Render."}</p>
          </div>
        </div>
      )}

      {online && (
        <>
          <section data-testid="tb-shipments" className="mt-6 rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-navy">Spedizioni TravelBox</h2>
                <p className="text-sm text-muted-foreground">Storico dal portale. Le date sono obbligatorie per vedere le righe.</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Dal</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-10" />
                </div>
                <div>
                  <Label className="text-xs">Al</Label>
                  <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-10" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(1); qc.invalidateQueries({ queryKey: ["tb", "shipments"] }); }}
                  className="h-10"
                >
                  Filtra
                </Button>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-brand-soft px-5 py-3">
                <p className="text-sm font-medium text-navy">{selected.size} etichette selezionate</p>
                <div className="flex items-center gap-2">
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger className="h-9 w-48 bg-white">
                      <SelectValue>{(v) => groups.data?.find((g) => g.id === v)?.name ?? "Gruppo etichette"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(groups.data ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!groupId || mergeMutation.isPending}
                    onClick={() => mergeMutation.mutate()}
                    className="bg-brand text-white hover:bg-brand-hover"
                  >
                    {mergeMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    Unisci etichette
                  </Button>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-5">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Seleziona tutte" />
                  </TableHead>
                  <TableHead>Riferimento</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Vettore</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead className="text-right">Prezzo</TableHead>
                  <TableHead className="pr-5 text-right">Etichetta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.isPending && (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Caricamento…</TableCell></TableRow>
                )}
                {!shipments.isPending && rows.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Nessuna spedizione nel periodo scelto.</TableCell></TableRow>
                )}
                {rows.map((row: TravelBoxShipment, index) => {
                  const href = tbLabelHref(row);
                  return (
                    <TableRow key={row.id ?? row.reference ?? index} className="hover:bg-muted/50">
                      <TableCell className="pl-5">
                        <Checkbox
                          checked={!!row.id && selected.has(row.id)}
                          disabled={!row.id}
                          onCheckedChange={() => row.id && toggleOne(row.id)}
                          aria-label={`Seleziona ${row.reference ?? ""}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm font-semibold text-navy">{row.reference ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.created_at ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.carrier ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.recipient?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.status ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.tracking_number ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-navy">{tbMoney(row.price)}</TableCell>
                      <TableCell className="pr-5 text-right">
                        {href ? (
                          <a href={href} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
                            <Download className="size-3.5" /> PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
              <p className="text-muted-foreground">Pagina {page}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="size-4" /> Precedente
                </Button>
                <Button variant="outline" size="sm" disabled={rows.length < 100} onClick={() => setPage((p) => p + 1)}>
                  Successiva <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </section>

          <section data-testid="tb-cart" className="mt-6 rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-5">
              <h2 className="font-heading text-lg font-semibold text-navy">Carrello TravelBox</h2>
              <p className="text-sm text-muted-foreground">Spedizioni create ma non pagate. Il pagamento va completato sul portale.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Riferimento</TableHead>
                  <TableHead>Vettore</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Prezzo</TableHead>
                  <TableHead className="pr-5 text-right">Etichetta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.isPending && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Caricamento…</TableCell></TableRow>
                )}
                {!cart.isPending && cartRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carrello vuoto.</TableCell></TableRow>
                )}
                {cartRows.map((row: TravelBoxShipment, index) => {
                  const href = tbLabelHref(row);
                  return (
                    <TableRow key={row.id ?? row.reference ?? index} className="hover:bg-muted/50">
                      <TableCell className="pl-5 font-mono text-sm font-semibold text-navy">{row.reference ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.carrier ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.recipient?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.status ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-navy">{tbMoney(row.price)}</TableCell>
                      <TableCell className="pr-5 text-right">
                        {href ? (
                          <a href={href} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
                            <Download className="size-3.5" /> PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </DashboardShell>
  );
}
