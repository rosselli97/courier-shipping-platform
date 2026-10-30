import { motion } from "motion/react";
import { CheckCircle2, Circle, MapPin } from "lucide-react";
import type { TrackingResponse } from "@/lib/types";
import { CourierLogo, StatusBadge } from "@/components/brand";
import { dateTimeIt } from "@/lib/format";

export default function TrackingTimeline({ data }: { data: TrackingResponse }) {
  const events = [...data.events].reverse();
  return (
    <div data-testid="tracking-timeline-container" className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Codice spedizione</p>
          <p data-testid="tracking-code" className="font-mono text-lg font-bold text-navy">{data.tracking_code}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.origin_city} → {data.dest_city}
          </p>
        </div>
        <CourierLogo courier={data.courier} size="sm" />
      </div>
      <div className="mt-3">
        <StatusBadge status={data.status} testId="tracking-status-badge" />
      </div>
      <ol className="mt-6 space-y-0">
        {events.map((e, i) => (
          <motion.li
            key={`${e.timestamp}-${i}`}
            data-testid="tracking-step-item"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            {i < events.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-border" />}
            {i === 0 ? (
              <CheckCircle2 className="relative z-10 size-6 shrink-0 fill-brand text-white" />
            ) : (
              <Circle className="relative z-10 size-6 shrink-0 fill-white text-slate-300" />
            )}
            <div className="min-w-0">
              <p className={i === 0 ? "font-semibold text-navy" : "font-medium text-slate-600"}>{e.description}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {e.location} · {dateTimeIt(e.timestamp)}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
