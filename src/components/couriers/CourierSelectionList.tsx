import { motion } from "motion/react";
import { ArrowRight, Check, Clock, Zap } from "lucide-react";
import type { CourierQuote } from "@/lib/types";
import { CourierLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { eur } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  quotes: CourierQuote[];
  onSelect: (q: CourierQuote) => void;
  pendingCourier?: string | null;
}

export default function CourierSelectionList({ quotes, onSelect, pendingCourier }: Props) {
  const cheapest = Math.min(...quotes.map((q) => q.price));
  const fastest = quotes.find((q) => q.courier === "dhl")?.courier;
  return (
    <div className="space-y-3" data-testid="courier-selection-list">
      {quotes.map((q, i) => {
        const best = q.price === cheapest;
        return (
          <motion.article
            key={q.courier}
            data-testid={`courier-card-${q.courier}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "group relative rounded-2xl border bg-card p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5",
              best ? "border-brand/50 ring-1 ring-brand/20" : "hover:border-slate-300",
            )}
          >
            {(best || q.courier === fastest) && (
              <span
                className={cn(
                  "absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                  best ? "bg-brand text-white" : "bg-navy text-white",
                )}
              >
                {best ? "Più conveniente" : "Più veloce"}
              </span>
            )}
            <div className="flex items-start gap-4">
              <CourierLogo courier={q.courier} />
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-base font-semibold text-navy">{q.courier_name}</h3>
                <p className="text-xs text-muted-foreground">{q.service_name}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-navy">
                  {q.courier === "dhl" ? <Zap className="size-4 text-brand" /> : <Clock className="size-4 text-brand" />}
                  {q.delivery_time}
                </p>
              </div>
              <div className="text-right">
                <p data-testid={`courier-price-${q.courier}`} className="font-heading text-2xl font-bold text-navy">
                  {eur(q.price)}
                </p>
                <p className="text-[11px] text-muted-foreground">IVA esclusa</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {q.features.map((f) => (
                <span key={f} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-slate-600">
                  <Check className="size-3 text-emerald-600" /> {f}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p data-testid="courier-price-breakdown" className="font-mono text-[11px] text-muted-foreground">
                Tariffa {eur(q.base_cost)} · Carburante {eur(q.fuel_surcharge)} · Servizio {eur(q.markup)}
              </p>
              <Button
                data-testid={`courier-select-btn-${q.courier}`}
                onClick={() => onSelect(q)}
                disabled={pendingCourier === q.courier}
                className="h-10 bg-brand px-4 font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Seleziona e spedisci <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
