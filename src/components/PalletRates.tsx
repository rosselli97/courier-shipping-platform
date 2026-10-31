import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { CourierLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut } from "@/lib/api";
import { COURIER_NAME, errorMessage } from "@/lib/format";
import type { CourierId, PalletRate, PalletRatesResponse } from "@/lib/types";

const COURIERS: CourierId[] = ["poste", "brt", "dhl"];
const ZONES = [1, 2, 3] as const;

/** Admin editor: fixed courier tariff per pallet, per courier × zone (markup rules apply on top). */
export default function PalletRates() {
  const qc = useQueryClient();
  const rates = useQuery({ queryKey: ["admin", "pallet-rates"], queryFn: () => apiGet<PalletRatesResponse>("/admin/pallet-rates") });
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const data = rates.isError ? undefined : rates.data;
  const k = (c: CourierId, z: number) => `${c}-${z}`;
  const value = (c: CourierId, z: number) =>
    draft?.[k(c, z)] ?? String(data?.rates.find((r) => r.courier === c && r.zone === z)?.price ?? "");

  const save = useMutation({
    mutationFn: (body: PalletRate[]) => apiPut<PalletRatesResponse>("/admin/pallet-rates", { rates: body }),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "pallet-rates"] });
      qc.invalidateQueries({ queryKey: ["quote"] });
      toast.success("Tariffe pallet salvate");
    },
    onError: (e) => toast.error(errorMessage(e, "Controlla gli importi (maggiori di 0)")),
  });

  const submit = () => {
    if (!draft) return;
    const body: PalletRate[] = Object.entries(draft).map(([key, v]) => {
      const [courier, zone] = key.split("-");
      return { courier: courier as CourierId, zone: Number(zone) as 1 | 2 | 3, price: Number(v) };
    });
    save.mutate(body);
  };

  return (
    <section id="corrieri" data-testid="admin-pallet-rates-card" className="scroll-mt-28 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
            <Boxes className="size-5 text-brand" /> Tariffe pallet
          </h2>
          <p className="text-sm text-muted-foreground">
            Costo fisso per pallet (fino a 1000 kg), separato dalla tariffa a kg dei pacchi. Il ricarico del cliente si applica sopra.
          </p>
        </div>
        <Button
          data-testid="admin-pallet-save-btn"
          disabled={!draft || save.isPending}
          onClick={submit}
          className="h-10 shrink-0 bg-brand px-5 font-semibold text-white hover:bg-brand-hover"
        >
          {save.isPending ? "Salvataggio…" : "Salva tariffe"}
        </Button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Corriere</th>
              {ZONES.map((z) => (
                <th key={z} className="pb-2 pl-3 font-medium">
                  <span className="block font-semibold text-navy">Zona {z}</span>
                  <span className="font-normal">{data?.zones[String(z)]?.split(" · ")[1] ?? ""}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COURIERS.map((c) => (
              <tr key={c} data-testid={`admin-pallet-row-${c}`} className="border-t">
                <td className="py-3">
                  <span className="flex items-center gap-3">
                    <CourierLogo courier={c} size="sm" />
                    <span className="hidden font-medium text-navy md:inline">{COURIER_NAME[c]}</span>
                  </span>
                </td>
                {ZONES.map((z) => (
                  <td key={z} className="py-3 pl-3">
                    <div className="relative">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        aria-label={`Tariffa pallet ${COURIER_NAME[c]} zona ${z}`}
                        data-testid={`admin-pallet-input-${c}-${z}`}
                        value={value(c, z)}
                        onChange={(e) => setDraft({ ...(draft ?? {}), [k(c, z)]: e.target.value })}
                        className="h-10 pr-7 text-right font-mono"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Zona 1: stessa area o confinante · Zona 2: media distanza · Zona 3: lunga distanza (in base alla prima cifra del CAP).
      </p>
    </section>
  );
}
