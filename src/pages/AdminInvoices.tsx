import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/format";
import { TB_PORTAL_URL, tbInvoices, tbMoney, type TravelBoxInvoice } from "@/lib/travelbox";

export default function AdminInvoices() {
  const invoices = useQuery({ queryKey: ["tb", "invoices"], queryFn: tbInvoices, retry: false });
  const rows = invoices.isError ? [] : invoices.data ?? [];

  return (
    <DashboardShell
      role="admin"
      title="Fatture"
      subtitle="Documenti di spedizione emessi dal portale TravelBox."
      actions={
        <a
          href={`${TB_PORTAL_URL}/elencofatture`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-light"
        >
          Apri portale <ExternalLink className="size-4" />
        </a>
      }
    >
      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-semibold text-navy">Elenco fatture</h2>
            <p className="text-sm text-muted-foreground">Le fatture e i PDF restano sul portale TravelBox.</p>
          </div>
        </div>

        {invoices.isError && (
          <p className="m-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorMessage(invoices.error, "Fatture non disponibili: verifica le credenziali TravelBox.")}
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Numero</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead className="pr-5 text-right">Documento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.isPending && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Caricamento…</TableCell></TableRow>
            )}
            {!invoices.isPending && !invoices.isError && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nessuna fattura disponibile.</TableCell></TableRow>
            )}
            {rows.map((invoice: TravelBoxInvoice, index: number) => (
              <TableRow key={`${invoice.number ?? "invoice"}-${index}`} className="hover:bg-muted/50">
                <TableCell className="pl-5 font-mono text-sm font-semibold text-navy">{invoice.number ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{invoice.date ?? "—"}</TableCell>
                <TableCell className="text-sm">{invoice.customer ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold text-navy">{tbMoney(invoice.amount)}</TableCell>
                <TableCell className="pr-5 text-right">
                  {invoice.pdf_url ? (
                    <a
                      href={`${TB_PORTAL_URL}/${invoice.pdf_url.replace(/^\/+/, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                    >
                      <ExternalLink className="size-3.5" /> Apri
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </DashboardShell>
  );
}
