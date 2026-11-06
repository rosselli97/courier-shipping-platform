import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Scale } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import CourierSelectionList from "@/components/couriers/CourierSelectionList";
import ShipmentDialog from "@/components/ShipmentDialog";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { CourierQuote, QuoteRequest, QuoteResponse } from "@/lib/types";

export default function Couriers() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const me = useMe();
  const [selected, setSelected] = useState<CourierQuote | null>(null);

  const req: QuoteRequest = {
    origin_cap: params.get("o") ?? "",
    dest_cap: params.get("d") ?? "",
    origin_city: params.get("oc") || null,
    dest_city: params.get("dc") || null,
    weight_kg: Number(params.get("w") ?? 0),
    length_cm: Number(params.get("l") ?? 0),
    width_cm: Number(params.get("wi") ?? 0),
    height_cm: Number(params.get("h") ?? 0),
    pieces: Number(params.get("n") ?? 1),
    is_pallet: params.get("p") === "1",
    source: me.data ? "travelbox" : "local",
  };

  const quote = useQuery({
    queryKey: ["quote", req],
    queryFn: () => apiPost<QuoteResponse>("/quote", req),
    retry: false,
  });

  const onSelect = (q: CourierQuote) => {
    if (!me.data) {
      toast.info("Accedi con il tuo account Business per spedire");
      navigate(`/login?next=${encodeURIComponent(`/spedisci?${params.toString()}`)}`);
      return;
    }
    setSelected(q);
  };

  return (
    <div className="relative min-h-screen bg-page">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        <img
          src="/brand/logo-navy.png"
          alt=""
          className="w-[92vw] max-w-[1100px] select-none opacity-[0.10]"
        />
      </div>
      <div className="relative z-10 border-b bg-white">
        <PublicHeader />
      </div>
      <main className="relative z-10 mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <Link to="/" data-testid="couriers-back-link" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-navy">
          <ArrowLeft className="size-4" /> Modifica pacco
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold text-navy">Scegli il corriere</h1>

        <div data-testid="couriers-route-summary" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-card px-4 py-3 text-sm">
          <span className="font-semibold text-navy">
            {req.origin_cap} {quote.data?.origin_city ?? req.origin_city} <span className="text-brand">→</span> {req.dest_cap} {quote.data?.dest_city ?? req.dest_city}
          </span>
          <span className="text-muted-foreground">{req.pieces} colli - {req.length_cm}×{req.width_cm}×{req.height_cm} cm</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Scale className="size-3.5" /> Peso tassabile{" "}
            <b data-testid="couriers-billable-weight" className="text-navy">{quote.data?.billable_weight_kg ?? req.weight_kg} kg</b>
          </span>
          {quote.data?.is_pallet && (
            <span data-testid="couriers-pallet-zone" className="inline-flex items-center gap-1 rounded-full bg-navy px-2.5 py-0.5 text-xs font-semibold text-white">
              Pallet · {quote.data.pallet_zone}
            </span>
          )}
          {quote.data?.provider === "travelbox" && (
            <span data-testid="couriers-travelbox-source" className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
              Prezzi reali TravelBox · IVA inclusa
            </span>
          )}
        </div>

        {quote.data?.notice && (
          <p data-testid="couriers-notice" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {quote.data.notice}
          </p>
        )}

        <div className="mt-6">
          {quote.isPending && (
            <div className="space-y-3" data-testid="couriers-loading">
              {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-200/60" />)}
            </div>
          )}
          {quote.isError && (
            <div data-testid="couriers-error" className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              Impossibile calcolare la tariffa. Controlla i dati del pacco e riprova.
            </div>
          )}
          {quote.data && !quote.isError && quote.data.quotes.length > 0 && (
            <CourierSelectionList quotes={quote.data.quotes} onSelect={onSelect} />
          )}
          {quote.data && !quote.isError && quote.data.quotes.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              {quote.data.notice ?? "Nessuna offerta disponibile per questa tratta."}
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Peso volumetrico calcolato come L×P×A / 5000.{" "}
          {quote.data?.provider === "travelbox" ? "Prezzi reali TravelBox IVA inclusa." : "Prezzi IVA esclusa."}
        </p>
      </main>
        <ShipmentDialog quote={selected} request={req} role={me.data?.role ?? "reseller"} prefillContactId={params.get("c")} sender={quote.data?.sender} onClose={() => setSelected(null)} />
    </div>
  );
}
