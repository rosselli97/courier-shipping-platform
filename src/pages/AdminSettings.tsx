import { LogOut, Mail, ShieldCheck, UserRound, Wallet } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { eur } from "@/lib/format";
import { endSession } from "@/lib/session";

function InfoRow({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-navy">{value}</p>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const me = useMe();
  const user = me.data;

  return (
    <DashboardShell role="admin" title="Impostazioni" subtitle="Profilo amministratore e configurazione dell'account.">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr] xl:items-start">
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <UserRound className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-lg font-semibold text-navy">Account</h2>
              <p className="text-sm text-muted-foreground">Dati del super amministratore collegato.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <InfoRow icon={UserRound} label="Azienda" value={user?.company_name ?? "—"} />
            <InfoRow icon={Mail} label="Email" value={user?.email ?? "—"} />
            <InfoRow icon={ShieldCheck} label="Ruolo" value={user?.role === "admin" ? "Super amministratore" : "Rivenditore"} />
            <InfoRow icon={Wallet} label="Saldo portafoglio" value={eur(user?.wallet_balance ?? 0)} />
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="font-heading text-lg font-semibold text-navy">Sessione</h2>
          <p className="mt-1 text-sm text-muted-foreground">Esci dall'area amministrazione su questo dispositivo.</p>
          <Button
            onClick={() => void endSession()}
            variant="outline"
            className="mt-5 h-11 w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <LogOut className="size-4" /> Esci dall'account
          </Button>
        </section>
      </div>
    </DashboardShell>
  );
}
