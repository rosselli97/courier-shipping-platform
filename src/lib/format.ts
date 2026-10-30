import type { CourierId, ShipmentStatus } from "./types";
import { ApiError } from "./api";

const eurFmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export const eur = (n: number) => eurFmt.format(n);

export const dateIt = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

export const dateTimeIt = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
export const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  creata: "Creata",
  in_transito: "In Transito",
  in_consegna: "In Consegna",
  consegnata: "Consegnato",
  giacenza: "In Giacenza",
};

export const STATUS_CLASS: Record<ShipmentStatus, string> = {
  creata: "bg-slate-100 text-slate-700 border-slate-200",
  in_transito: "bg-sky-50 text-sky-800 border-sky-200",
  in_consegna: "bg-brand-soft text-[#B53900] border-orange-200",
  consegnata: "bg-emerald-50 text-emerald-800 border-emerald-200",
  giacenza: "bg-amber-50 text-amber-800 border-amber-200",
};

export const COURIER_NAME: Record<CourierId, string> = {
  poste: "Poste Italiane",
  brt: "BRT",
  dhl: "DHL Express",
};

export function errorMessage(e: unknown, fallback = "Si è verificato un errore"): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body) {
    const d = (e.body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    return "Controlla i dati inseriti";
  }
  return fallback;
}
