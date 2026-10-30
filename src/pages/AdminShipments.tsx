import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ShipmentsTable from "@/components/ShipmentsTable";
import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { eur } from "@/lib/format";
import type { ResellerShipment } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function AdminShipments() {
  const shipments = useQuery({
    queryKey: ["admin", "shipments"],
    queryFn: () => apiGet<ResellerShipment[]>("/admin/shipments"),
    refetchInterval: (q) => (q.state.data?.some((s) => s.email_status === "pending") ? 3000 : false),
  });
  const data = shipments.isError ? undefined : shipments.data;
  const total = (data ?? []).reduce((a, s) => a + s.price, 0);

  return (
    <DashboardShell
      role="admin"
      title="Spedizioni effettuate"
      subtitle={data ? `${data.length} spedizioni interne · costo totale ${eur(total)}` : "Spedizioni create dal super admin."}
      actions={
        <Link to="/admin/nuova-spedizione" data-testid="admin-shipments-new-link" className={cn(buttonVariants(), "h-11 bg-brand px-5 font-semibold text-white hover:bg-brand-hover")}>
          <Plus className="size-4" /> Nuova spedizione
        </Link>
      }
    >
      <ShipmentsTable title="Spedizioni del super admin" data={data} isPending={shipments.isPending} labelBase="/admin" tid="admin" priceLabel="Costo" />
    </DashboardShell>
  );
}
