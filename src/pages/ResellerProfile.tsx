import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, MapPin, Package, Phone, Plus, TrendingUp, Wallet } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ShipmentsTable from "@/components/ShipmentsTable";
import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { dateIt, eur } from "@/lib/format";
import type { ResellerProfile, ResellerShipment } from "@/lib/types";
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

export default function ResellerProfilePage() {
  const profile = useQuery({
    queryKey: ["reseller", "profile"],
    queryFn: () => apiGet<ResellerProfile>("/reseller/profile"),
  });
  const shipments = useQuery({
    queryKey: ["reseller", "shipments"],
    queryFn: () => apiGet<ResellerShipment[]>("/reseller/shipments"),
  });

  const data = profile.isError ? undefined : profile.data;

  return (
    <DashboardShell
      role="reseller"
      title={data?.company_name ?? "Profilo"}
      subtitle="I tuoi dati aziendali e le spedizioni effettuate."
      actions={
        <Link
          to="/"
          data-testid="reseller-profile-new-shipment-link"
          className={cn(buttonVariants(), "h-11 bg-brand px-5 font-semibold text-white hover:bg-brand-hover")}
        >
          <Plus className="size-4" /> Nuova spedizione
        </Link>
      }
    >
      {profile.isPending && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Caricamento profilo...
        </div>
      )}

      {profile.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Impossibile caricare il profilo.
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
            <section data-testid="reseller-profile-card" className="rounded-2xl border bg-card p-6 shadow-sm">
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

            <section data-testid="reseller-profile-stats" className="grid grid-cols-2 gap-3">
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
              <div className="col-span-2 rounded-2xl border bg-card p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Wallet className="size-3.5 text-brand" /> Saldo portafoglio
                </p>
                <p className={cn("mt-1 font-heading text-2xl font-bold", data.wallet_balance < 0 ? "text-red-700" : "text-navy")}>
                  {eur(data.wallet_balance)}
                </p>
              </div>
            </section>
          </div>

          <ShipmentsTable
            title="Spedizioni effettuate"
            data={shipments.isError ? undefined : shipments.data}
            isPending={shipments.isPending}
            labelBase="/reseller"
            tid="reseller-profile"
          />
        </>
      )}
    </DashboardShell>
  );
}
