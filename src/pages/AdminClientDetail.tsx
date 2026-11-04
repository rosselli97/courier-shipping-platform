import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Loader2, MapPin, Package, Phone, TrendingUp, Wallet } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ShipmentsTable from "@/components/ShipmentsTable";
import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { dateIt, eur } from "@/lib/format";
import type { ClientRow, ResellerShipment } from "@/lib/types";
import { cn } from "@/lib/utils";

function InfoRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm text-navy">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function AdminClientDetail() {
  const { clientId = "" } = useParams();
  const client = useQuery({
    queryKey: ["admin", "client", clientId],
    queryFn: () => apiGet<ClientRow>(`/admin/clients/${clientId}`),
    enabled: clientId.length > 0,
  });
  const shipments = useQuery({
    queryKey: ["admin", "client-shipments", clientId],
    queryFn: () => apiGet<ResellerShipment[]>(`/admin/clients/${clientId}/shipments`),
    enabled: clientId.length > 0,
  });

  const data = client.isError ? undefined : client.data;

  return (
    <DashboardShell
      role="admin"
      title={data?.company_name ?? "Profilo cliente"}
      subtitle={data ? `${data.email} · ${data.vat_number}` : "Anagrafica del cliente e spedizioni effettuate."}
      actions={
        <Link
          to="/admin/clienti"
          data-testid="admin-client-detail-back-link"
          className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2")}
        >
          <ArrowLeft className="size-4" /> Tutti i clienti
        </Link>
      }
    >
      {client.isPending && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Caricamento profilo...
        </div>
      )}

      {client.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Cliente non trovato o non accessibile.
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
            <section data-testid="admin-client-detail-card" className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Building2 className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-heading text-xl font-bold text-navy">{data.company_name}</h2>
                    <p className="text-sm text-muted-foreground">{data.email}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    data.status === "active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-700",
                  )}
                >
                  {data.status === "active" ? "Attivo" : "Sospeso"}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <InfoRow icon={Building2} label="Partita IVA" value={data.vat_number} />
                <InfoRow icon={Phone} label="Telefono" value={data.phone ?? ""} />
                <InfoRow icon={MapPin} label="Indirizzo" value={data.address ?? ""} />
                <InfoRow icon={TrendingUp} label="Cliente dal" value={dateIt(data.created_at)} />
              </div>

              {data.contact_name && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Referente: <span className="font-medium text-navy">{data.contact_name}</span>
                </p>
              )}
            </section>

            <section data-testid="admin-client-detail-stats" className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Package className="size-3.5 text-brand" /> Spedizioni
                </p>
                <p className="mt-1 font-heading text-2xl font-bold text-navy">{data.shipments}</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="size-3.5 text-brand" /> Fatturato
                </p>
                <p className="mt-1 font-heading text-2xl font-bold text-navy">{eur(data.revenue)}</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Wallet className="size-3.5 text-brand" /> Saldo
                </p>
                <p className={cn("mt-1 font-heading text-2xl font-bold", data.wallet_balance < 0 ? "text-red-700" : "text-navy")}>
                  {eur(data.wallet_balance)}
                </p>
              </div>
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Building2 className="size-3.5 text-brand" /> Ricarichi
                </p>
                <p className="mt-1 font-heading text-2xl font-bold text-navy">{data.custom_markups}</p>
              </div>
            </section>
          </div>

          <ShipmentsTable
            title="Spedizioni effettuate"
            data={shipments.isError ? undefined : shipments.data}
            isPending={shipments.isPending}
            labelBase="/admin"
            tid="admin-client"
            priceLabel="Prezzo"
            allowDelete={false}
          />
        </>
      )}
    </DashboardShell>
  );
}
