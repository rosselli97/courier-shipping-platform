import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import TrackingTimeline from "@/components/tracking/TrackingTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import type { TrackingResponse } from "@/lib/types";

export default function Tracking() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(code);
  const tracking = useQuery({
    queryKey: ["tracking", code],
    queryFn: () => apiGet<TrackingResponse>(`/tracking/${encodeURIComponent(code)}`),
    retry: false,
  });

  return (
    <div className="min-h-screen bg-page">
      <div className="border-b bg-white"><PublicHeader /></div>
      <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <Link to="/" data-testid="tracking-back-link" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-navy">
          <ArrowLeft className="size-4" /> Home
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold text-navy">Traccia spedizione</h1>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) navigate(`/traccia/${encodeURIComponent(q.trim().toUpperCase())}`);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="tracking-page-input" aria-label="Codice di tracking" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 bg-white pl-9 font-mono uppercase" />
          </div>
          <Button type="submit" data-testid="tracking-page-submit" className="h-12 bg-navy px-5 text-white hover:bg-navy-light">Cerca</Button>
        </form>
        <div className="mt-6">
          {tracking.isPending && <div className="h-72 animate-pulse rounded-2xl bg-slate-200/60" />}
          {tracking.isError && (
            <div data-testid="tracking-not-found" className="rounded-2xl border border-dashed bg-card p-8 text-center">
              <p className="font-semibold text-navy">Spedizione non trovata</p>
              <p className="mt-1 text-sm text-muted-foreground">Verifica il codice e riprova.</p>
            </div>
          )}
          {tracking.data && !tracking.isError && <TrackingTimeline data={tracking.data} />}
        </div>
      </main>
    </div>
  );
}
