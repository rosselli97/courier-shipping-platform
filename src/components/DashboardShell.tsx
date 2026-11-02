import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BookUser, ChevronDown, Headset, LifeBuoy, LogOut, Package, Calculator, LayoutDashboard, ShieldCheck, Tags, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BrandLogo } from "@/components/brand";
import { useMe } from "@/lib/auth";
import { endSession } from "@/lib/session";
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

interface NavItem { to: string; label: string; icon: typeof Package; testId: string; hint?: string }

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Centro di controllo", icon: ShieldCheck, testId: "nav-admin", hint: "KPI, ricavi e tariffe" },
  { to: "/admin/nuova-spedizione", label: "Nuova spedizione", icon: Calculator, testId: "nav-admin-new-shipment", hint: "Spedisci con il ricarico configurato" },
  { to: "/admin/spedizioni", label: "Spedizioni effettuate", icon: Package, testId: "nav-admin-shipments", hint: "Elenco ed etichette PDF" },
  { to: "/admin/clienti", label: "Clienti B2B", icon: Users, testId: "nav-admin-clients", hint: "Clienti, saldi e stati" },
  { to: "/admin/listini", label: "Listini e ricarichi", icon: Tags, testId: "nav-admin-rate-lists", hint: "Listini TravelBox e margini clienti" },
  { to: "/admin/rubrica", label: "Rubrica destinatari", icon: BookUser, testId: "nav-admin-contacts", hint: "Aggiungi, modifica, elimina" },
  { to: "/admin/assistenza", label: "Assistenza ticket", icon: LifeBuoy, testId: "nav-admin-support", hint: "Rispondi ai rivenditori" },
];

/** Section switcher (dropdown) for the super admin, shown above the page title. */
function AdminSectionMenu({ current }: { current: string }) {
  const navigate = useNavigate();
  const active = ADMIN_NAV.find((n) => n.to === current) ?? ADMIN_NAV[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="admin-section-menu-trigger"
        className="mb-3 inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-sm font-semibold text-navy shadow-sm transition-[border-color,box-shadow] hover:border-brand/50 hover:shadow"
      >
        <active.icon className="size-4 text-brand" />
        {active.label}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-72 p-1.5">
        {ADMIN_NAV.map((n) => (
          <DropdownMenuItem
            key={n.to}
            data-testid={`admin-section-menu-item-${n.testId}`}
            onClick={() => navigate(n.to)}
            className={cn("flex items-start gap-3 rounded-lg px-3 py-2.5", n.to === current && "bg-brand-soft")}
          >
            <n.icon className={cn("mt-0.5 size-4", n.to === current ? "text-brand" : "text-slate-500")} />
            <span>
              <span className="block text-sm font-semibold text-navy">{n.label}</span>
              <span className="block text-xs text-muted-foreground">{n.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardShell({ title, subtitle, actions, children, role }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; role: "admin" | "reseller";
}) {
  const me = useMe();
  const loc = useLocation();
  const nav: NavItem[] = role === "admin"
    ? ADMIN_NAV
    : [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
        { to: "/", label: "Nuova spedizione", icon: Calculator, testId: "nav-new-shipment" },
        { to: "/dashboard/rubrica", label: "Rubrica", icon: BookUser, testId: "nav-contacts" },
        { to: "/dashboard/assistenza", label: "Assistenza", icon: LifeBuoy, testId: "nav-support" },
      ];
  return (
    <div className="min-h-screen bg-page lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-dark text-white lg:flex">
        <div className="px-6 py-7"><BrandLogo variant="white" className="h-5" /></div>
        <p className="px-6 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {role === "admin" ? "Super Admin" : "Area Rivenditori"}
        </p>
        <nav className="mt-3 space-y-1 px-3">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              data-testid={n.testId}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                loc.pathname === n.to ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <n.icon className={cn("size-4", loc.pathname === n.to && "text-brand")} /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          {role === "reseller" && (
            <div data-testid="shell-help-card" className="mx-3 mb-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-brand/20 text-brand">
                  <Headset className="size-4" />
                </span>
                <p className="text-sm font-semibold text-white">Serve aiuto?</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">Il nostro team è a tua disposizione.</p>
              <Link to="/dashboard/assistenza" data-testid="shell-help-link" className="mt-3 inline-flex text-sm font-semibold text-brand transition-colors hover:text-orange-300">
                Contatta l'assistenza
              </Link>
            </div>
          )}
          <div className="border-t border-white/10 p-4">
            <p data-testid="shell-user-company" className="truncate text-sm font-semibold">{me.data?.company_name}</p>
            <p className="truncate text-xs text-slate-400">{me.data?.email}</p>
            <button
              data-testid="logout-button"
              onClick={() => void endSession()}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-4" /> Esci
            </button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <BrandLogo className="h-5" />
        <button data-testid="logout-button-mobile" onClick={() => void endSession()} className="text-sm font-medium text-navy">
          Esci
        </button>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {role === "admin" && <AdminSectionMenu current={loc.pathname} />}
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
