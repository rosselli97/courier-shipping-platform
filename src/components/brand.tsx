import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { CourierId, ShipmentStatus } from "@/lib/types";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/format";

export function BrandLogo({ variant = "navy", className }: { variant?: "navy" | "white"; className?: string }) {
  return (
    <Link to="/" data-testid="brand-logo-link" className="inline-flex items-center">
      <img
        src={variant === "white" ? "/brand/logo-white.png" : "/brand/logo-navy.png"}
        alt="MUVPACK"
        className={cn("h-6 w-auto", className)}
      />
    </Link>
  );
}

const COURIER_TILE: Record<CourierId, { bg: string; text: string; label: string }> = {
  poste: { bg: "bg-[#FFCC00]", text: "text-[#0047BB] italic", label: "Poste" },
  brt: { bg: "bg-[#E30613]", text: "text-white", label: "BRT" },
  dhl: { bg: "bg-[#FFCC00]", text: "text-[#D40511] italic", label: "DHL" },
  fedex: { bg: "bg-[#4D148C]", text: "text-white", label: "FedEx" },
  ups: { bg: "bg-[#351C15]", text: "text-[#FFB500]", label: "UPS" },
  other: { bg: "bg-slate-700", text: "text-white", label: "Sped." },
};

export function CourierLogo({ courier, size = "md" }: { courier: CourierId; size?: "sm" | "md" | "lg" }) {
  const t = COURIER_TILE[courier];
  const dims = { sm: "h-7 w-12 text-[11px]", md: "h-11 w-16 text-sm", lg: "h-14 w-20 text-lg" }[size];
  return (
    <span
      data-testid={`courier-logo-${courier}`}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-heading font-black tracking-tight shadow-sm", t.bg, t.text, dims)}
    >
      {t.label}
    </span>
  );
}

export function StatusBadge({ status, testId }: { status: ShipmentStatus; testId?: string }) {
  return (
    <span
      data-testid={testId ?? "shipment-status-badge"}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_CLASS[status])}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chevrons({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 70" className={className} aria-hidden="true">
      <polygon fill="currentColor" points="37,0 80,0 101,35 80,70 54,70 73,35 59,12 30,70 0,70" />
      <polygon fill="currentColor" points="107,0 134,0 160,35 134,70 107,70 128,35" />
    </svg>
  );
}
