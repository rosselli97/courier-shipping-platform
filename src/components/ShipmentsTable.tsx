import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Download, Loader2, Mail, MailWarning, Search, X } from "lucide-react";
import { CourierLogo, StatusBadge } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { API_BASE } from "@/lib/api";
import { dateIt, eur, STATUS_LABEL } from "@/lib/format";
import type { ResellerShipment, ShipmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: Record<string, string> = { all: "Tutti gli stati", ...STATUS_LABEL };

interface Props {
  title: string;
  data: ResellerShipment[] | undefined;
  isPending: boolean;
  /** "/reseller" or "/admin" — label endpoints of the owner */
  labelBase: string;
  /** data-testid prefix, e.g. "reseller" or "admin" */
  tid: string;
  priceLabel?: string;
}

export default function ShipmentsTable({ title, data, isPending, labelBase, tid, priceLabel = "Prezzo" }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!s || r.tracking_code.toLowerCase().includes(s) || r.recipient_name.toLowerCase().includes(s) || r.dest_city.toLowerCase().includes(s)),
    );
  }, [data, search, status]);

  const selectableRows = rows.filter((r) => r.source !== "travelbox");
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) selectableRows.forEach((r) => next.delete(r.id));
      else selectableRows.slice(0, 100).forEach((r) => next.add(r.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulkHref = `${API_BASE}${labelBase}/labels?ids=${[...selected].slice(0, 100).join(",")}`;

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold text-navy">{title}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid={`${tid}-search-shipment-input`} aria-label="Cerca spedizione" placeholder="Codice, destinatario, città" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9 sm:w-64" />
          </div>
          <Select value={status} onValueChange={(v: string) => setStatus(v)}>
            <SelectTrigger data-testid={`${tid}-filter-status-select`} className="h-10 sm:w-44">
              <SelectValue>{(v) => FILTERS[v as string]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FILTERS).map(([k, l]) => (
                <SelectItem key={k} value={k} data-testid={`${tid}-filter-option-${k}`}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {selected.size > 0 && (
        <motion.div
          data-testid={`${tid}-bulk-action-bar`}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 border-b bg-brand-soft px-5 py-3"
        >
          <p className="text-sm font-medium text-navy">
            <span data-testid={`${tid}-bulk-selected-count`} className="font-bold">{selected.size}</span>{" "}
            {selected.size === 1 ? "spedizione selezionata" : "spedizioni selezionate"}
            {selected.size > 100 && <span className="text-muted-foreground"> (max 100 per PDF)</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" data-testid={`${tid}-bulk-clear-button`} onClick={() => setSelected(new Set())}>
              <X className="size-3.5" /> Deseleziona
            </Button>
            <a
              href={bulkHref}
              download
              data-testid={`${tid}-bulk-download-labels-button`}
              onClick={() => toast.success(`Download di ${Math.min(selected.size, 100)} etichette avviato`)}
              className={cn(buttonVariants({ size: "sm" }), "bg-brand text-white hover:bg-brand-hover")}
            >
              <Download className="size-3.5" /> Scarica etichette (PDF unico)
            </a>
          </div>
        </motion.div>
      )}
      <Table data-testid={`${tid}-shipments-table`}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-5">
              <Checkbox data-testid={`${tid}-select-all-checkbox`} aria-label="Seleziona tutte" checked={allVisibleSelected} disabled={selectableRows.length === 0} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Codice</TableHead>
            <TableHead>Corriere</TableHead>
            <TableHead>Tratta</TableHead>
            <TableHead>Destinatario</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">{priceLabel}</TableHead>
            <TableHead className="pr-5 text-right">Etichetta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending && (
            <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Caricamento…</TableCell></TableRow>
          )}
          {!isPending && rows.length === 0 && (
            <TableRow><TableCell colSpan={9} data-testid={`${tid}-shipments-empty`} className="py-10 text-center text-muted-foreground">Nessuna spedizione trovata.</TableCell></TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id} data-testid={`${tid}-shipment-row-${r.tracking_code}`} data-selected={selected.has(r.id) || undefined} className="transition-colors hover:bg-muted/50 data-[selected]:bg-brand-soft/60">
              <TableCell className="pl-5">
                <Checkbox data-testid={`${tid}-row-checkbox`} aria-label={`Seleziona ${r.tracking_code}`} checked={selected.has(r.id)} disabled={r.source === "travelbox"} onCheckedChange={() => toggleOne(r.id)} />
              </TableCell>
              <TableCell>
                <Link to={`/traccia/${r.tracking_code}`} data-testid={`${tid}-shipment-track-link`} className="font-mono text-sm font-semibold text-navy hover:text-brand">
                  {r.tracking_code}
                </Link>
                {r.source === "travelbox" && (
                  <span data-testid={`${tid}-travelbox-badge`} className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">TravelBox</span>
                )}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <CourierLogo courier={r.courier} size="sm" />
                  {r.is_pallet && <span data-testid={`${tid}-pallet-badge`} className="rounded bg-navy px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Pallet</span>}
                </span>
              </TableCell>
              <TableCell className="text-sm">{r.origin_city} → {r.dest_city}</TableCell>
              <TableCell className="text-sm">
                <span className="inline-flex items-center gap-1.5">
                  {r.recipient_name}
                  {r.email_status === "sent" && <Mail data-testid={`${tid}-email-sent-icon`} aria-label="Email inviata" className="size-3.5 text-emerald-600" />}
                  {r.email_status === "pending" && <Loader2 aria-label="Email in invio" className="size-3.5 animate-spin text-slate-400" />}
                  {r.email_status === "failed" && <MailWarning data-testid={`${tid}-email-failed-icon`} aria-label="Email non inviata" className="size-3.5 text-amber-600" />}
                </span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{dateIt(r.created_at)}</TableCell>
              <TableCell><StatusBadge status={r.status as ShipmentStatus} /></TableCell>
              <TableCell className="text-right font-semibold text-navy">{eur(r.price)}</TableCell>
              <TableCell className="pr-5 text-right">
                {r.source === "travelbox" ? (
                  <span data-testid={`${tid}-travelbox-label-hint`} className="text-xs text-muted-foreground">Su TravelBox</span>
                ) : (
                  <a
                    href={`${API_BASE}${labelBase}/shipments/${r.id}/label`}
                    download={`etichetta-${r.tracking_code}.pdf`}
                    data-testid={`${tid}-download-pdf-label-button`}
                    onClick={() => toast.success("Download etichetta PDF avviato")}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 hover:border-brand hover:text-brand")}
                  >
                    <Download className="size-3.5" /> PDF
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
