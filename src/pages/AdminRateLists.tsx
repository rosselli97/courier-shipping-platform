import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Percent, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/DashboardShell";
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
  onSaved,
}: {
  lists: RateList[];
  clientId: string;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromLists(lists));
  const [detailFor, setDetailFor] = useState<RateList | null>(null);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.list.id === id ? { ...row, ...patch } : row)));

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

  const saveStandard = useMutation({
    mutationFn: () =>
      apiPut<RateList[]>("/travelbox/rate-lists/markups", {
        client_id: null,
        rules: rulesPayload(
          rows.map((row) => ({ list: row.list, type: row.standardType, value: row.standardValue })),
        ),
      }),
    onSuccess: () => {
      toast.success("Ricarichi standard salvati");
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveClient = useMutation({
    mutationFn: () =>
      apiPut<RateList[]>("/travelbox/rate-lists/markups", {
        client_id: clientId,
        rules: rulesPayload(
          rows
            .filter((row) => row.custom)
            .map((row) => ({ list: row.list, type: row.customType, value: row.customValue })),
        ),
      }),
    onSuccess: () => {
      toast.success("Ricarico cliente salvato");
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <Table className="min-w-[980px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-16">Attivo</TableHead>
              <TableHead>Listino</TableHead>
              <TableHead>Validità</TableHead>
              <TableHead>Fasce</TableHead>
              <TableHead className="w-60">Ricarico standard</TableHead>
              {clientId && <TableHead className="w-72">Ricarico cliente</TableHead>}
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
                      placeholder="fallback"
                      onChange={(event) => update(row.list.id, { standardValue: event.target.value })}
                      className="h-8 w-20 text-right font-mono"
                    />
                  </div>
                </TableCell>
                {clientId && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={row.custom}
                        onCheckedChange={(checked) =>
                          update(row.list.id, { custom: checked === true })
                        }
                        aria-label={`Personalizza ${row.list.name}`}
                      />
                      <Select
                        value={row.customType}
                        onValueChange={(value: string) =>
                          update(row.list.id, { customType: value as MarkupType })
                        }
                        disabled={!row.custom}
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
                        disabled={!row.custom}
                        onChange={(event) => update(row.list.id, { customValue: event.target.value })}
                        className="h-8 w-20 text-right font-mono"
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          onClick={() => saveStandard.mutate()}
          disabled={saveStandard.isPending}
          className="bg-navy text-white hover:bg-navy-light"
        >
          {saveStandard.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salva ricarichi standard
        </Button>
        {clientId && (
          <Button
            type="button"
            onClick={() => saveClient.mutate()}
            disabled={saveClient.isPending}
            className="bg-brand text-white hover:bg-brand-hover"
          >
            {saveClient.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salva ricarico cliente
          </Button>
        )}
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
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <Percent className="size-4 text-brand" />
                Ricarico da applicare
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Seleziona un cliente per un ricarico dedicato per listino. Se il campo standard è
                vuoto si usa il ricarico per corriere già configurato.
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
            onSaved={() => void qc.invalidateQueries({ queryKey: ["admin", "rate-lists"] })}
          />
        )}
      </div>
    </DashboardShell>
  );
}
