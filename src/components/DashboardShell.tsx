import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Bell, BookUser, ChevronDown, ChevronLeft, ChevronRight, Headset, LifeBuoy, LogOut, Package, Calculator, LayoutDashboard, Receipt, Search, ShieldCheck, Tags, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BrandLogo, Chevrons } from "@/components/brand";
import NotificationBell from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  { to: "/admin/notifiche", label: "Gestione notifiche", icon: Bell, testId: "nav-admin-notifications", hint: "Invia e controlla le notifiche" },
  { to: "/admin/nuova-spedizione", label: "Nuova spedizione", icon: Calculator, testId: "nav-admin-new-shipment", hint: "Spedisci e decidi il ricarico" },
  { to: "/admin/spedizioni", label: "Spedizioni effettuate", icon: Package, testId: "nav-admin-shipments", hint: "Elenco ed etichette PDF" },
  { to: "/admin/cerca", label: "Cerca spedizione", icon: Search, testId: "nav-admin-search", hint: "MUVPACK e TravelBox" },
  { to: "/admin/addebiti", label: "Addebiti", icon: Receipt, testId: "nav-admin-charges", hint: "Addebiti manuali sui profili" },
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
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("muvpack.sidebar.collapsed") === "1";
  });
  useEffect(() => {
    window.localStorage.setItem("muvpack.sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  const nav: NavItem[] = role === "admin"
    ? ADMIN_NAV
    : [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
        { to: "/notifiche", label: "Notifiche", icon: Bell, testId: "nav-notifications" },
        { to: "/", label: "Nuova spedizione", icon: Calculator, testId: "nav-new-shipment" },
        { to: "/dashboard/rubrica", label: "Rubrica", icon: BookUser, testId: "nav-contacts" },
        { to: "/dashboard/assistenza", label: "Assistenza", icon: LifeBuoy, testId: "nav-support" },
      ];
  return (
    <div className={cn("min-h-screen bg-page transition-[padding] duration-200", collapsed ? "lg:pl-20" : "lg:pl-64")}>
      <aside
        data-collapsed={collapsed}
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy-dark text-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <button
          type="button"
          data-testid="sidebar-toggle-button"
          aria-label={collapsed ? "Espandi menu laterale" : "Comprimi menu laterale"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="absolute -right-3 top-6 z-40 hidden size-6 place-items-center rounded-full border bg-white text-navy shadow-sm transition-colors hover:bg-brand-soft lg:grid"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
        <div className={cn("py-7", collapsed ? "flex justify-center px-2" : "px-6")}>
          {collapsed ? (
            <Link to="/" title="MUVPACK" data-testid="brand-logo-link" className="grid size-10 place-items-center rounded-xl bg-brand/20 text-brand">
              <Chevrons className="h-4 w-8" />
            </Link>
          ) : (
            <BrandLogo variant="white" className="h-5" />
          )}
        </div>
        {!collapsed && (
          <p className="px-6 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {role === "admin" ? "Super Admin" : "Area Rivenditori"}
          </p>
        )}
        <nav className={cn("mt-3 space-y-1", collapsed ? "px-2" : "px-3")}>
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              data-testid={n.testId}
              title={collapsed ? n.label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5",
                loc.pathname === n.to ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <n.icon className={cn("size-4", loc.pathname === n.to && "text-brand")} />
              {!collapsed && <span>{n.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          {!collapsed && role === "reseller" && (
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
          <div className={cn("border-t border-white/10", collapsed ? "p-2" : "p-4")}>
            {!collapsed && (
              <>
                <p data-testid="shell-user-company" className="truncate text-sm font-semibold">{me.data?.company_name}</p>
                <p className="truncate text-xs text-slate-400">{me.data?.email}</p>
              </>
            )}
            <button
              data-testid="logout-button"
              title={collapsed ? "Esci" : undefined}
              onClick={() => void endSession()}
              className={cn(
                "flex items-center rounded-lg text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white",
                collapsed ? "mx-auto justify-center px-0 py-2.5" : "mt-3 w-full gap-2 px-3 py-2",
              )}
            >
              <LogOut className="size-4" /> {!collapsed && "Esci"}
            </button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <BrandLogo className="h-5" />
        <div className="flex items-center gap-2">
          <NotificationBell className="size-9" />
          <button data-testid="logout-button-mobile" onClick={() => void endSession()} className="text-sm font-medium text-navy">
            Esci
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {role === "admin" && <AdminSectionMenu current={loc.pathname} />}
            <h1 data-testid="page-title" className="font-heading text-3xl font-bold text-navy sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
            <NotificationBell />
            {role === "admin" && (
              <form
                className="flex w-full items-center gap-2 sm:w-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = search.trim();
                  if (value.length >= 2) navigate(`/admin/cerca?q=${encodeURIComponent(value)}`);
                }}
              >
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    data-testid="global-shipment-search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cerca spedizione..."
                    className="h-10 pl-9"
                  />
                </div>
                <Button type="submit" data-testid="global-shipment-search-submit" disabled={search.trim().length < 2} className="h-10 bg-navy text-white hover:bg-navy-light">
                  Cerca
                </Button>
              </form>
            )}
            {actions}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
