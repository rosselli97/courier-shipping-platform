import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ShipmentsTable from "@/components/ShipmentsTable";
import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import type { ResellerShipment } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ResellerShipments() {
  const shipments = useQuery({
    queryKey: ["reseller", "shipments"],
    queryFn: () => apiGet<ResellerShipment[]>("/reseller/shipments"),
  });

  return (
    <DashboardShell
      role="reseller"
      title="Spedizioni effettuate"
      subtitle="Tutte le spedizioni del tuo account, con filtri ed etichette PDF."
      actions={
        <Link
          to="/"
          data-testid="reseller-shipments-new-link"
          className={cn(buttonVariants(), "h-11 bg-brand px-5 font-semibold text-white hover:bg-brand-hover")}
        >
          <Plus className="size-4" /> Nuova spedizione
        </Link>
      }
    >
      <ShipmentsTable
        title="Le tue spedizioni"
        data={shipments.isError ? undefined : shipments.data}
        isPending={shipments.isPending}
        labelBase="/reseller"
        tid="reseller-profile"
      />
    </DashboardShell>
  );
}
