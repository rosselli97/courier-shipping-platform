import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import { eur, errorMessage } from "@/lib/format";
import type { ShipmentSearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function AdminSearch() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [term, setTerm] = useState(q);

  useEffect(() => {
    setTerm(q);
  }, [q]);

  const search = useQuery({
    queryKey: ["admin", "shipment-search", q],
    queryFn: () => apiGet<ShipmentSearchResponse>(`/admin/shipment-search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    retry: false,
  });

  const results = search.isError ? [] : search.data?.results ?? [];
  const notice = search.data?.notice;

  return (
    <DashboardShell
      role="admin"
      title="Cerca spedizione"
      subtitle="Cerca per codice MUVPACK, riferimento TravelBox, tracking o nome in tutti i portali collegati."
    >
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const value = term.trim();
          if (value.length >= 2) setParams({ q: value });
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="shipment-search-input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Es. TBC-40226, MVP20260001, tracking o nome destinatario"
            className="h-12 pl-10 text-base"
          />
        </div>
        <Button type="submit" disabled={term.trim().length < 2} className="h-12 gap-2 bg-brand px-6 font-semibold text-white hover:bg-brand-hover">
          <Search className="size-4" /> Cerca
        </Button>
      </form>

      {notice && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice}</p>
      )}

      {search.isError && (
        <div className="mt-6 rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {errorMessage(search.error, "Ricerca non riuscita")}
        </div>
      )}

      {search.isPending && q.length >= 2 && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Ricerca in MUVPACK e TravelBox...
        </div>
      )}

      {!search.isPending && q.length >= 2 && results.length === 0 && !search.isError && (
        <div data-testid="shipment-search-empty" className="mt-6 rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Nessuna spedizione trovata per “{q}”.
        </div>
      )}

      <div className="mt-6 space-y-3" data-testid="shipment-search-results">
        {results.map((r, index) => (
          <article key={`${r.source}-${r.reference ?? r.tracking_number ?? index}`} data-testid="shipment-search-result" className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-navy">{r.reference || r.tracking_code || r.tracking_number}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold uppercase tracking-wide", r.source === "muvpack" ? "bg-navy text-white" : "bg-brand-soft text-brand")}>
                    {r.source === "muvpack" ? "MUVPACK" : "TravelBox"}
                  </span>
                  {r.status && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-slate-700">{r.status}</span>}
                  {r.carrier && <span className="text-muted-foreground">{r.carrier}</span>}
                </div>
                <p className="mt-2 text-sm text-navy">
                  {[r.sender_name, r.recipient_name].filter(Boolean).join(" → ") || "Mittente/destinatario non disponibili"}
                </p>
                {(r.origin_city || r.dest_city) && (
                  <p className="text-xs text-muted-foreground">{[r.origin_city, r.dest_city].filter(Boolean).join(" → ")}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {[r.created_at, r.tracking_number ? `Tracking ${r.tracking_number}` : null, r.price != null ? eur(r.price) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.local && r.tracking_code && (
                  <Link to={`/traccia/${r.tracking_code}`} className={cn(buttonVariants({ size: "sm" }), "bg-navy text-white hover:bg-navy-light")}>
                    Apri tracking
                  </Link>
                )}
                {r.portal_url && (
                  <a href={r.portal_url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
                    Portale TravelBox
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </DashboardShell>
  );
}
