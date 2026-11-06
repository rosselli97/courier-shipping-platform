import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Percent, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/DashboardShell";
import PalletRates from "@/components/PalletRates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { eur, errorMessage } from "@/lib/format";
import type {
  ClientRow,
  MarkupType,
  RateList,
  RateListDetail,
  RateListImportResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<MarkupType, string> = { percent: "Percentuale %", fixed: "Fisso €" };

interface Row {
  list: RateList;
  standardType: MarkupType;
  standardValue: string;
  custom: boolean;
  customType: MarkupType;
  customValue: string;
}

function rowsFromLists(lists: RateList[]): Row[] {
  return lists.map((list) => {
    const standard = list.standard_markup;
    const client = list.client_markup;
    return {
      list,
      standardType: standard?.type ?? "percent",
      standardValue: standard ? String(standard.value) : "",
      custom: Boolean(client),
      customType: client?.type ?? standard?.type ?? "percent",
      customValue: client ? String(client.value) : standard ? String(standard.value) : "0",
    };
  });
}

function rulesPayload(items: { list: RateList; type: MarkupType; value: string }[]) {
  return items
    .filter((item) => String(item.value).trim() !== "")
    .map((item) => ({ list_id: item.list.id, type: item.type, value: Number(item.value) }));
}

function formatValidity(list: RateList) {
  const from = list.valid_from || "—";
  const to = list.valid_to && list.valid_to !== "2999-01-01" ? list.valid_to : "—";
  return `${from} → ${to}`;
}

function PriceDialog({ list, onClose }: { list: RateList | null; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const detail = useQuery({
    queryKey: ["admin", "rate-list-detail", list?.id],
    queryFn: () => apiGet<RateListDetail>(`/travelbox/rate-lists/${list!.id}`),
    enabled: list !== null,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const listRows = detail.data?.rows ?? [];
    if (!q) return listRows;
    return listRows.filter((row) =>
      `${row.shipment_type} ${row.tariff_type} ${row.notes}`.toLowerCase().includes(q),
    );
  }, [detail.data, query]);

  return (
    <Dialog open={list !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-navy">{list?.name}</DialogTitle>
          <DialogDescription>
            {list?.carrier} · {list?.type} · {list?.row_count ?? 0} fasce di prezzo
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca nazione, tipologia o fascia..."
            className="pl-9"
          />
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-xl border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow>
                <TableHead>Tipologia / Nazione</TableHead>
                <TableHead>Fascia</TableHead>
                <TableHead className="text-right">Peso (kg)</TableHead>
                <TableHead className="text-right">Prezzo</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.isPending ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                    Caricamento prezzi...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Nessuna fascia trovata.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={`${row.shipment_type}-${row.tariff_type}-${index}`}>
                    <TableCell className="font-medium text-navy">{row.shipment_type || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.tariff_type || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {row.weight_max ? `${row.weight_min} - ${row.weight_max}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-navy">{eur(row.price)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.notes || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} fasce visualizzate{detail.data ? ` su ${detail.data.rows.length}` : ""}.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  lists,
  clientId,
  clientName,
  onSaved,
}: {
  lists: RateList[];
  clientId: string;
  clientName?: string;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromLists(lists));
  const [detailFor, setDetailFor] = useState<RateList | null>(null);
  const [quickStandardType, setQuickStandardType] = useState<MarkupType>("percent");
  const [quickStandardValue, setQuickStandardValue] = useState("");
  const [quickClientType, setQuickClientType] = useState<MarkupType>("percent");
  const [quickClientValue, setQuickClientValue] = useState("");

  const update = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.list.id === id ? { ...row, ...patch } : row)));

  const applyStandardToAll = () => {
    if (quickStandardValue.trim() === "") {
      toast.error("Inserisci il valore del ricarico standard");
      return;
    }
    setRows((current) =>
      current.map((row) => ({
        ...row,
        standardType: quickStandardType,
        standardValue: quickStandardValue,
      })),
    );
    toast.success(`Ricarico standard ${quickStandardType === "percent" ? "%" : "€"} applicato a tutti i listini`);
  };

  const applyClientToAll = () => {
    if (quickClientValue.trim() === "") {
      toast.error("Inserisci il valore del ricarico cliente");
      return;
    }
    setRows((current) =>
      current.map((row) => ({
        ...row,
        custom: true,
        customType: quickClientType,
        customValue: quickClientValue,
      })),
    );
    toast.success(`Ricarico cliente applicato a tutti i listini`);
  };

  const clearCustom = () => {
    setRows((current) => current.map((row) => ({ ...row, custom: false })));
    toast.success("Personalizzazioni rimosse: torna il ricarico standard");
  };

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiPatch<RateList>(`/travelbox/rate-lists/${id}`, { active }),
    onSuccess: (updated) =>
      setRows((current) =>
        current.map((row) =>
          row.list.id === updated.id
            ? { ...row, list: { ...row.list, active: updated.active } }
            : row,
        ),
      ),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      await apiPut<RateList[]>("/travelbox/rate-lists/markups", {
        client_id: null,
        rules: rulesPayload(
          rows.map((row) => ({ list: row.list, type: row.standardType, value: row.standardValue })),
        ),
      });
      if (clientId) {
        await apiPut<RateList[]>("/travelbox/rate-lists/markups", {
          client_id: clientId,
          rules: rulesPayload(
            rows
              .filter((row) => row.custom)
              .map((row) => ({ list: row.list, type: row.customType, value: row.customValue })),
          ),
        });
      }
    },
    onSuccess: () => {
      toast.success(clientId ? "Ricarico standard e cliente salvati" : "Ricarichi standard salvati");
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <section data-testid="rate-lists-quick-markup" className="mb-4 rounded-2xl border bg-slate-50/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy">
              <Percent className="size-4 text-brand" /> Ricarico rapido
            </p>
            <p className="text-xs text-muted-foreground">
              Applica lo stesso ricarico a tutti i listini in un clic, poi premi Salva modifiche.
              Ogni riga può restare standard o diventare personalizzata.
            </p>
          </div>
          <Button
            type="button"
            data-testid="rate-lists-quick-save"
            onClick={() => saveAll.mutate()}
            disabled={saveAll.isPending}
            className="h-9 shrink-0 bg-brand px-4 font-semibold text-white hover:bg-brand-hover"
          >
            {saveAll.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salva modifiche
          </Button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Standard · tutti i clienti
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                value={quickStandardType}
                onValueChange={(value: string) => setQuickStandardType(value as MarkupType)}
              >
                <SelectTrigger data-testid="quick-standard-type" className="h-9 w-32">
                  <SelectValue>{(value) => TYPE_LABEL[value as MarkupType]}</SelectValue>
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
                value={quickStandardValue}
                onChange={(event) => setQuickStandardValue(event.target.value)}
                placeholder="Es. 12"
                aria-label="Valore ricarico standard rapido"
                data-testid="quick-standard-value"
                className="h-9 w-24 text-right font-mono"
              />
              <Button
                type="button"
                data-testid="quick-standard-apply"
                onClick={applyStandardToAll}
                className="h-9 bg-navy px-3 text-white hover:bg-navy-light"
              >
                Applica a tutti
              </Button>
            </div>
          </div>

          {clientId && (
            <div className="rounded-xl border bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Personalizzato{clientName ? ` · ${clientName}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  value={quickClientType}
                  onValueChange={(value: string) => setQuickClientType(value as MarkupType)}
                >
                  <SelectTrigger data-testid="quick-client-type" className="h-9 w-32">
                    <SelectValue>{(value) => TYPE_LABEL[value as MarkupType]}</SelectValue>
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
                  value={quickClientValue}
                  onChange={(event) => setQuickClientValue(event.target.value)}
                  placeholder="Es. 8"
                  aria-label="Valore ricarico cliente rapido"
                  data-testid="quick-client-value"
                  className="h-9 w-24 text-right font-mono"
                />
                <Button
                  type="button"
                  data-testid="quick-client-apply"
                  onClick={applyClientToAll}
                  className="h-9 bg-brand px-3 text-white hover:bg-brand-hover"
                >
                  Applica a tutti
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="quick-client-clear"
                  onClick={clearCustom}
                  className="h-9 text-xs text-slate-600"
                >
                  Togli personalizzazioni
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <Table className="min-w-[1080px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-16">Attivo</TableHead>
              <TableHead>Listino</TableHead>
              <TableHead>Validità</TableHead>
              <TableHead>Fasce</TableHead>
              <TableHead className="w-60">Ricarico standard</TableHead>
              {clientId && <TableHead className="w-80">Ricarico cliente</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.list.id} className={cn(!row.list.active && "bg-slate-50/60")}>
                <TableCell>
                  <Checkbox
                    checked={row.list.active}
                    onCheckedChange={(checked) =>
                      toggleActive.mutate({ id: row.list.id, active: checked === true })
                    }
                    aria-label={`Attiva ${row.list.name}`}
                  />
                </TableCell>
                <TableCell>
                  <p className="font-semibold text-navy">{row.list.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.list.carrier} · {row.list.type}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatValidity(row.list)}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailFor(row.list)}
                    className="h-8"
                  >
                    {row.list.row_count} fasce
                  </Button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Select
                      value={row.standardType}
                      onValueChange={(value: string) =>
                        update(row.list.id, { standardType: value as MarkupType })
                      }
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue>{(value) => TYPE_LABEL[value as MarkupType]}</SelectValue>
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
                      value={row.standardValue}
                      placeholder="0"
                      onChange={(event) => update(row.list.id, { standardValue: event.target.value })}
                      className="h-8 w-20 text-right font-mono"
                    />
                  </div>
                </TableCell>
                {clientId && (
                  <TableCell>
                    <div className="space-y-2">
                      <div className="inline-flex rounded-lg border bg-white p-0.5">
                        <button
                          type="button"
                          data-testid={`rate-list-${row.list.id}-standard`}
                          onClick={() => update(row.list.id, { custom: false })}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                            !row.custom ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100",
                          )}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          data-testid={`rate-list-${row.list.id}-custom`}
                          onClick={() => update(row.list.id, { custom: true })}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                            row.custom ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100",
                          )}
                        >
                          Personalizzato
                        </button>
                      </div>

                      {row.custom ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={row.customType}
                            onValueChange={(value: string) =>
                              update(row.list.id, { customType: value as MarkupType })
                            }
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue>{(value) => TYPE_LABEL[value as MarkupType]}</SelectValue>
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
                            value={row.customValue}
                            placeholder={row.standardValue ? `standard ${row.standardValue}` : "nessun ricarico"}
                            onChange={(event) => update(row.list.id, { customValue: event.target.value })}
                            className="h-8 w-24 text-right font-mono"
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {row.standardValue
                            ? `Usa lo standard (${row.standardValue}).`
                            : "Nessun ricarico standard."}
                        </p>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-muted-foreground sm:mr-auto">
          {clientId
            ? "Vengono salvati sia il ricarico standard sia quello personalizzato del cliente."
            : "Viene salvato il ricarico standard dei listini."}
        </p>
        <Button
          type="button"
          data-testid="rate-lists-save-all"
          onClick={() => saveAll.mutate()}
          disabled={saveAll.isPending}
          className="bg-brand font-semibold text-white hover:bg-brand-hover"
        >
          {saveAll.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salva modifiche
        </Button>
      </div>

      <PriceDialog key={detailFor?.id ?? "none"} list={detailFor} onClose={() => setDetailFor(null)} />
    </>
  );
}

export default function AdminRateLists() {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const clients = useQuery({
    queryKey: ["admin", "clients"],
    queryFn: () => apiGet<ClientRow[]>("/admin/clients"),
  });
  const lists = useQuery({
    queryKey: ["admin", "rate-lists", clientId],
    queryFn: () =>
      apiGet<RateList[]>(
        `/travelbox/rate-lists${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ""}`,
      ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const importMutation = useMutation({
    mutationFn: () => apiPost<RateListImportResult>("/travelbox/rate-lists/import"),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["admin", "rate-lists"] });
      toast.success(
        `Importati ${result.lists} listini e ${result.rows} fasce` +
          (result.failed ? ` (${result.failed} con errori)` : ""),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const importedAt = useMemo(() => {
    const dates = (lists.data ?? [])
      .map((list) => new Date(list.imported_at).getTime())
      .filter((value) => Number.isFinite(value));
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toLocaleString("it-IT");
  }, [lists.data]);

  const selectedClient = clients.data?.find((client) => client.id === clientId);

  return (
    <DashboardShell
      role="admin"
      title="Listini e ricarichi"
      subtitle="Importa i listini TravelBox, attiva solo quelli che usi e imposta il ricarico per ogni cliente."
      actions={
        <Button
          type="button"
          data-testid="rate-lists-import-button"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          className="bg-brand text-white hover:bg-brand-hover"
        >
          {importMutation.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          {importMutation.isPending ? "Importazione..." : "Importa da TravelBox"}
        </Button>
      }
    >
      <div className="space-y-5">
        <PalletRates />
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <Percent className="size-4 text-brand" />
                Ricarico da applicare
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Seleziona un cliente per un ricarico dedicato per listino. Se il campo standard è
                vuoto il listino non applica alcun ricarico.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <Select
                value={clientId || "standard"}
                onValueChange={(value: string) => setClientId(value === "standard" ? "" : value)}
              >
                <SelectTrigger data-testid="rate-lists-client-select" className="h-10">
                  <SelectValue>
                    {(value) => {
                      if (value === "standard") return "Standard (tutti i clienti)";
                      return clients.data?.find((client) => client.id === value)?.company_name ?? "Cliente";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard (tutti i clienti)</SelectItem>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Listini importati: {lists.data?.length ?? 0}</span>
            <span>Attivi: {(lists.data ?? []).filter((list) => list.active).length}</span>
            {importedAt && <span>Ultimo import: {importedAt}</span>}
            {selectedClient && <span>Cliente: {selectedClient.company_name}</span>}
          </div>
          {clientId && (
            <p className="mt-2 text-xs text-muted-foreground">
              Il ricarico personalizzato vale per i nuovi preventivi e le nuove spedizioni
              dell'account selezionato. Non modifica le spedizioni già create.
            </p>
          )}
        </section>

        {lists.isPending ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl border bg-muted/40" />
            ))}
          </div>
        ) : lists.isError ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Impossibile caricare i listini. Riprova tra poco.
          </div>
        ) : (lists.data?.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <h2 className="font-heading text-lg font-semibold text-navy">Nessun listino importato</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Premi "Importa da TravelBox" per scaricare tutti i listini con le fasce di peso e
              prezzo. L'operazione può richiedere 30-60 secondi.
            </p>
          </div>
        ) : (
          <Editor
            key={`${clientId || "standard"}-${lists.dataUpdatedAt}`}
            lists={lists.data ?? []}
            clientId={clientId}
            clientName={selectedClient?.company_name}
            onSaved={() => {
              void qc.invalidateQueries({ queryKey: ["admin", "rate-lists"] });
              void qc.invalidateQueries({ queryKey: ["quote"] });
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
}
