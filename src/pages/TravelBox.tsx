import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ChevronLeft, ChevronRight, Download, Loader2, Package, RefreshCw, Truck } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/format";
import {
  tbAddressBook,
  tbCart,
  tbCreateShipment,
  tbHealth,
  tbLabelGroups,
  tbLabelHref,
  tbMergeLabels,
  tbMoney,
  tbQuote,
  tbShipments,
  type TravelBoxAddress,
  type TravelBoxCreateResult,
  type TravelBoxDraft,
  type TravelBoxOffer,
  type TravelBoxQuoteResult,
  type TravelBoxShipment,
} from "@/lib/travelbox";
import { cn } from "@/lib/utils";

const YEAR = new Date().getFullYear();
const EMPTY_PACKAGE = { weight: "20", length: "40", width: "40", height: "40", pieces: "1", type: "pacchi" };

function partyLabel(entry: TravelBoxAddress): string {
  const p = entry.party;
  const name = p.name || "Senza nome";
  const place = [p.postal_code, p.city].filter(Boolean).join(" ");
  return `${name}${place ? ` · ${place}` : ""}${p.province ? ` (${p.province})` : ""}`;
}

function canUseParty(entry: TravelBoxAddress): boolean {
  const p = entry.party;
  return !!entry.id && !!p.city && !!p.postal_code && !!p.province;
}

export default function TravelBox() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(`${YEAR}-01-01`);
  const [dateTo, setDateTo] = useState(`${YEAR}-12-31`);
  const [refresh, setRefresh] = useState(0);
  const [senderId, setSenderId] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [form, setForm] = useState(EMPTY_PACKAGE);
  const [quote, setQuote] = useState<TravelBoxQuoteResult | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<TravelBoxOffer | null>(null);
  const [createStage, setCreateStage] = useState<TravelBoxCreateResult | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState("");

  const health = useQuery({ queryKey: ["tb", "health"], queryFn: tbHealth, retry: false, staleTime: 60_000 });
  const online = health.data?.logged_in === true;

  const book = useQuery({ queryKey: ["tb", "book"], queryFn: tbAddressBook, enabled: online, retry: false });
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

  const addresses = book.data ?? [];
  const senders = useMemo(() => addresses.filter((a) => canUseParty(a) && (!a.kind || a.kind.toLowerCase().includes("mitt"))), [addresses]);
  const recipients = useMemo(() => addresses.filter((a) => canUseParty(a) && (!a.kind || a.kind.toLowerCase().includes("dest"))), [addresses]);
  const sender = senders.find((a) => a.id === senderId);
  const recipient = recipients.find((a) => a.id === recipientId);

  useEffect(() => {
    if (!senderId && senders[0]?.id) setSenderId(senders[0].id);
  }, [senderId, senders]);
  useEffect(() => {
    if (!recipientId && recipients[0]?.id) setRecipientId(recipients[0].id);
  }, [recipientId, recipients]);
  useEffect(() => {
    if (!groupId && groups.data?.[0]?.id) setGroupId(groups.data[0].id);
  }, [groupId, groups.data]);

  const draft = (): TravelBoxDraft | null => {
    if (!sender?.id || !recipient?.id) return null;
    const s = sender.party;
    const r = recipient.party;
    if (!s.city || !s.postal_code || !s.province || !r.city || !r.postal_code || !r.province) return null;
    return {
      sender_id: sender.id,
      recipient_id: recipient.id,
      sender_city: s.city,
      sender_cap: s.postal_code,
      sender_province: s.province,
      recipient_city: r.city,
      recipient_cap: r.postal_code,
      recipient_province: r.province,
      packages: [
        {
          pieces: Number(form.pieces) || 1,
          weight_kg: Number(form.weight),
          width_cm: Number(form.width),
          height_cm: Number(form.height),
          length_cm: Number(form.length),
          type: form.type,
        },
      ],
      service_type: "nazionale",
    };
  };

  const validPackage = [form.weight, form.length, form.width, form.height].every((v) => Number(v) > 0);
  const canQuote = !!sender && !!recipient && validPackage;

  const quoteMutation = useMutation({
    mutationFn: (body: TravelBoxDraft) => tbQuote(body),
    onSuccess: (result) => {
      setQuote(result);
      setSelectedOffer(null);
      if (result.offers.length === 0) toast.info(result.message || "Nessuna offerta disponibile");
    },
    onError: (e) => toast.error(errorMessage(e, "Preventivo non disponibile")),
  });

  const createMutation = useMutation({
    mutationFn: (confirm: boolean) =>
      tbCreateShipment({
        draft: quote!.draft,
        offer_id: selectedOffer?.id ?? undefined,
        confirm,
      }),
    onSuccess: (result) => {
      setCreateStage(result);
      if (result.status === "submitted") {
        toast.success(`Spedizione ${result.shipment?.reference ?? ""} aggiunta al carrello`);
        qc.invalidateQueries({ queryKey: ["tb", "shipments"] });
        qc.invalidateQueries({ queryKey: ["tb", "cart"] });
      }
    },
    onError: (e) => toast.error(errorMessage(e, "Creazione non riuscita")),
  });

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

  const runQuote = () => {
    const body = draft();
    if (!body) {
      toast.error("Seleziona mittente e destinatario con CAP, città e provincia");
      return;
    }
    quoteMutation.mutate(body);
  };

  const openCreate = (offer: TravelBoxOffer) => {
    setSelectedOffer(offer);
    setCreateStage(null);
    setCreateOpen(true);
  };

  const closeCreate = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setSelectedOffer(null);
      setCreateStage(null);
    }
  };

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
      subtitle="Prezzi reali dal portale TravelBox Contorno, spedizioni in carrello ed etichette PDF."
      actions={
        <Button onClick={refreshAll} variant="outline" className="h-11 gap-2">
          <RefreshCw className="size-4" /> Aggiorna
        </Button>
      }
    >
      {health.isPending && (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-brand" /> Connessione al portale TravelBox…
        </div>
      )}

      {health.isError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Portale non raggiungibile</p>
            <p>{errorMessage(health.error, "Controlla le credenziali TravelBox su Render.")}</p>
          </div>
        </div>
      )}

      {health.data && !health.data.logged_in && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Login TravelBox non riuscito</p>
            <p>{health.data.detail || "Verifica TRAVELBOX_USERID e TRAVELBOX_PASSWORD nelle env vars di Render."}</p>
          </div>
        </div>
      )}

      {online && (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr] xl:items-start">
            <section data-testid="tb-quote-form" className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold text-navy">Nuovo preventivo reale</h2>
                <Truck className="size-5 text-brand" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Usa la rubrica del portale: il preventivo viene calcolato da TravelBox, nessuna spedizione viene creata.
              </p>

              <div className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Mittente</Label>
                  <Select value={senderId} onValueChange={setSenderId}>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue>{(v) => senders.find((a) => a.id === v) ? partyLabel(senders.find((a) => a.id === v)!) : "Seleziona mittente…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {senders.map((a) => (
                        <SelectItem key={a.id!} value={a.id!}>{partyLabel(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Destinatario</Label>
                  <Select value={recipientId} onValueChange={setRecipientId}>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue>{(v) => recipients.find((a) => a.id === v) ? partyLabel(recipients.find((a) => a.id === v)!) : "Seleziona destinatario…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map((a) => (
                        <SelectItem key={a.id!} value={a.id!}>{partyLabel(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {book.isPending && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Caricamento rubrica TravelBox…</p>
                )}
                {book.isError && <p className="text-xs text-destructive">{errorMessage(book.error, "Rubrica non disponibile")}</p>}
                {!book.isPending && !book.isError && addresses.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nessun indirizzo nella rubrica TravelBox.</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tipologia</Label>
                    <Select value={form.type} onValueChange={(v: string) => setForm({ ...form, type: v })}>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue>{(v) => (v === "pallet" ? "Pallet" : "Pacco")}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pacchi">Pacco</SelectItem>
                        <SelectItem value="pallet">Pallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Colli</Label>
                    <Input type="number" min="1" step="1" value={form.pieces} onChange={(e) => setForm({ ...form, pieces: e.target.value })} className="h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Peso (kg)</Label>
                  <Input type="number" min="0.1" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="h-11" />
                </div>

                <div>
                  <Label>Dimensioni (cm) — L × P × A</Label>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <Input aria-label="Lunghezza" type="number" min="1" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} className="h-11" />
                    <Input aria-label="Larghezza" type="number" min="1" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} className="h-11" />
                    <Input aria-label="Altezza" type="number" min="1" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} className="h-11" />
                  </div>
                </div>

                {sender && recipient && (
                  <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Tratta: <b className="text-navy">{sender.party.city}</b> → <b className="text-navy">{recipient.party.city}</b>
                  </p>
                )}

                <Button onClick={runQuote} disabled={!canQuote || quoteMutation.isPending} className="h-12 w-full bg-brand font-semibold text-white hover:bg-brand-hover">
                  {quoteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />}
                  Calcola prezzi reali
                </Button>
              </div>
            </section>

            <section data-testid="tb-offers" className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="font-heading text-lg font-semibold text-navy">Offerte TravelBox</h2>
              {!quote && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Seleziona mittente, destinatario e collo, poi premi «Calcola prezzi reali».
                </p>
              )}
              {quote && (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {quote.draft.sender_city} → {quote.draft.recipient_city} · {quote.draft.packages[0]?.weight_kg ?? "—"} kg · nessuna scrittura sul portale
                  </p>
                  {quote.message && <p className="mt-2 text-sm text-amber-700">{quote.message}</p>}
                  <div className="mt-4 space-y-3">
                    {quote.offers.map((offer, index) => (
                      <article key={offer.id ?? `${offer.carrier}-${index}`} className="rounded-2xl border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-heading text-base font-semibold text-navy">{offer.carrier ?? "Corriere"}</p>
                            <p className="text-xs text-muted-foreground">{offer.service ?? "Servizio"}</p>
                            {offer.delivery_days && <p className="mt-1 text-xs text-slate-500">{offer.delivery_days}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-heading text-2xl font-bold text-navy">{tbMoney(offer.price)}</p>
                            <p className="text-[11px] text-muted-foreground">IVA inclusa</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                          <p className="font-mono text-[11px] text-muted-foreground">
                            Netto {tbMoney(offer.net_price)} · IVA {tbMoney(offer.tax)}{offer.weight_kg ? ` · ${offer.weight_kg} kg` : ""}
                          </p>
                          <Button
                            size="sm"
                            disabled={!offer.id}
                            onClick={() => openCreate(offer)}
                            className="bg-brand text-white hover:bg-brand-hover"
                          >
                            Crea spedizione
                          </Button>
                        </div>
                      </article>
                    ))}
                    {quote.offers.length === 0 && !quote.message && (
                      <p className="text-sm text-muted-foreground">Nessuna offerta disponibile per questa tratta.</p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>

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
                <Button variant="outline" size="sm" onClick={() => { setPage(1); qc.invalidateQueries({ queryKey: ["tb", "shipments"] }); }} className="h-10">Filtra</Button>
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

      <Dialog open={createOpen} onOpenChange={closeCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">Crea spedizione TravelBox</DialogTitle>
            <DialogDescription>
              {selectedOffer?.carrier ?? "Corriere"} · {tbMoney(selectedOffer?.price)} · {selectedOffer?.service ?? "Servizio"}
            </DialogDescription>
          </DialogHeader>

          {createStage?.status === "submitted" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-emerald-700">{createStage.message}</p>
              {createStage.shipment && (
                <div className="rounded-xl bg-muted p-4 text-sm">
                  <p className="font-semibold text-navy">{createStage.shipment.reference ?? "Spedizione"}</p>
                  <p className="text-muted-foreground">Tracking: <span className="font-mono">{createStage.shipment.tracking_number ?? "—"}</span></p>
                  <p className="text-muted-foreground">Stato: {createStage.shipment.status ?? "—"}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">La spedizione è nel carrello: il pagamento va completato sul portale TravelBox.</p>
              {createStage.shipment && tbLabelHref(createStage.shipment) && (
                <a href={tbLabelHref(createStage.shipment)!} download className={cn(buttonVariants(), "h-11 w-full gap-2 bg-navy text-white hover:bg-navy-light")}>
                  <Download className="size-4" /> Scarica etichetta PDF
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {quote && (
                <div className="rounded-xl bg-muted p-4 text-sm">
                  <p className="font-semibold text-navy">{quote.draft.sender_city} → {quote.draft.recipient_city}</p>
                  <p className="text-muted-foreground">
                    {quote.draft.packages[0]?.weight_kg ?? "—"} kg · {quote.draft.packages[0]?.length_cm ?? "—"}×{quote.draft.packages[0]?.width_cm ?? "—"}×{quote.draft.packages[0]?.height_cm ?? "—"} cm
                  </p>
                </div>
              )}
              {createStage?.status === "preview" && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{createStage.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                «Anteprima» non scrive sul portale. «Conferma in carrello» crea la spedizione senza pagamento.
              </p>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  variant="outline"
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate(false)}
                  className="h-11"
                >
                  {createMutation.isPending && createStage === null ? <Loader2 className="size-4 animate-spin" /> : null}
                  Anteprima
                </Button>
                <Button
                  disabled={createMutation.isPending || !selectedOffer?.id}
                  onClick={() => createMutation.mutate(true)}
                  className="h-11 bg-brand text-white hover:bg-brand-hover"
                >
                  {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
                  Conferma in carrello
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
