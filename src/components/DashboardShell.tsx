import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookUser,
  Briefcase,
  Calculator,
  ChevronDown,
  FileText,
  Headset,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Package,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BrandLogo } from "@/components/brand";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { endSession } from "@/lib/session";
import type { ResellerShipment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RequireRole({ role, children }: { role: "admin" | "reseller"; children: ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-page" data-testid="auth-loading">
        <div className="size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }
  if (me.isError || !me.data) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (me.data.role !== role) return <Navigate to={me.data.role === "admin" ? "/admin" : "/dashboard"} replace />;
  return <>{children}</>;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof Package;
  testId: string;
  hash?: string;
}

const ADMIN_WORK: NavItem[] = [
  { to: "/admin", label: "Panoramica", icon: LayoutDashboard, testId: "nav-admin" },
  { to: "/admin/spedizioni", label: "Spedizioni", icon: Package, testId: "nav-admin-shipments" },
  { to: "/admin#corrieri", label: "Corrieri", icon: Briefcase, testId: "nav-admin-couriers", hash: "corrieri" },
  { to: "/admin#clienti", label: "Clienti B2B", icon: Users, testId: "nav-admin-clients", hash: "clienti" },
  { to: "/admin#regole", label: "Regole di ricarico", icon: SlidersHorizontal, testId: "nav-admin-rules", hash: "regole" },
];

const ADMIN_MANAGE: NavItem[] = [
  { to: "/admin/fatture", label: "Fatture", icon: FileText, testId: "nav-admin-invoices" },
  { to: "/admin/impostazioni", label: "Impostazioni", icon: Settings, testId: "nav-admin-settings" },
];

const RESELLER_WORK: NavItem[] = [
  { to: "/dashboard", label: "Panoramica", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/", label: "Nuova spedizione", icon: Calculator, testId: "nav-new-shipment" },
  { to: "/dashboard/rubrica", label: "Rubrica", icon: BookUser, testId: "nav-contacts" },
];

const RESELLER_MANAGE: NavItem[] = [
  { to: "/dashboard/assistenza", label: "Assistenza", icon: LifeBuoy, testId: "nav-support" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "MV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function DashboardShell({ title, subtitle, actions, children, role }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; role: "admin" | "reseller";
}) {
  const me = useMe();
  const loc = useLocation();

  const shipments = useQuery({
    queryKey: ["admin", "shipments"],
    queryFn: () => apiGet<ResellerShipment[]>("/admin/shipments"),
    enabled: role === "admin",
    staleTime: 60_000,
  });

  const work = role === "admin" ? ADMIN_WORK : RESELLER_WORK;
  const manage = role === "admin" ? ADMIN_MANAGE : RESELLER_MANAGE;
  const company = me.data?.company_name || "MUVPACK";
  const avatar = role === "admin" ? "MA" : initials(company);
  const roleLabel = role === "admin" ? "Super amministratore" : "Rivenditore";
  const profileHref = role === "admin" ? "/admin/impostazioni" : "/dashboard";
  const helpHref = role === "admin" ? "/admin/assistenza" : "/dashboard/assistenza";

  const isActive = (item: NavItem) => {
    if (item.hash) return loc.pathname === "/admin" && loc.hash === `#${item.hash}`;
    if (item.to === "/admin") return loc.pathname === "/admin" && !loc.hash;
    return loc.pathname === item.to;
  };

  const badgeFor = (item: NavItem) =>
    role === "admin" && item.testId === "nav-admin-shipments" && shipments.data?.length
      ? shipments.data.length
      : undefined;

  const renderNav = (items: NavItem[]) => (
    <div className="space-y-1">
      {items.map((item) => {
        const active = isActive(item);
        const badge = badgeFor(item);
        return (
          <Link
            key={item.testId}
            to={item.to}
            data-testid={item.testId}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand text-white shadow-[0_10px_28px_-14px_rgba(255,80,1,0.95)]"
                : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", active ? "text-white" : "text-slate-400")} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge !== undefined && (
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                active ? "bg-white/20 text-white" : "bg-white/10 text-slate-300",
              )}>
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-page lg:pl-[280px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col bg-[#062B44] text-white lg:flex">
        <div className="px-6 pb-5 pt-7">
          <BrandLogo variant="white" className="h-6" />
        </div>

        <div className="px-4">
          <Link
            to={profileHref}
            data-testid="shell-profile-card"
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 transition-colors hover:bg-white/[0.09]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/20 text-sm font-bold text-brand">
              {avatar}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{company}</span>
              <span className="block truncate text-xs text-slate-400">{roleLabel}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-slate-400" />
          </Link>
        </div>

        <nav className="mt-7 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          <div>
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Area di lavoro</p>
            <div className="mt-2">{renderNav(work)}</div>
          </div>
          <div>
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gestione</p>
            <div className="mt-2">{renderNav(manage)}</div>
          </div>
        </nav>

        <div className="px-4 pb-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-brand/20 text-brand">
                <Headset className="size-4" />
              </span>
              <p className="text-sm font-semibold text-white">Serve aiuto?</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">Il nostro team è a tua disposizione.</p>
            <Link to={helpHref} data-testid="shell-help-link" className="mt-3 inline-flex text-sm font-semibold text-brand transition-colors hover:text-orange-300">
              Contatta l'assistenza
            </Link>
          </div>
        </div>

        <div className="border-t border-white/10 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="shell-user-menu"
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/5"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-slate-200">
                {avatar}
              </span>
              <span className="min-w-0 flex-1">
                <span data-testid="shell-user-company" className="block truncate text-sm font-semibold text-white">{company}</span>
                <span className="block truncate text-xs text-slate-400">{me.data?.email}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-56">
              <DropdownMenuItem data-testid="logout-button" onClick={() => void endSession()} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="size-4" /> Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <BrandLogo className="h-5" />
        <button data-testid="logout-button-mobile" onClick={() => void endSession()} className="text-sm font-medium text-navy">
          Esci
        </button>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 data-testid="page-title" className="font-heading text-3xl font-bold text-navy sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
