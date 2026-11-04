import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Inbox, Loader2 } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { dateTimeIt } from "@/lib/format";
import { useNotificationActions, useNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const me = useMe();
  const role = me.data?.role ?? "reseller";
  const notifications = useNotifications();
  const { markRead, markAll } = useNotificationActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <DashboardShell
      role={role}
      title="Notifiche"
      subtitle="Clicca una notifica per aprirla e segnarla come letta."
      actions={
        <div className="flex flex-wrap gap-2">
          {role === "admin" && (
            <Link
              to="/admin/notifiche"
              data-testid="notifications-manage-link"
              className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2")}
            >
              <Bell className="size-4" /> Gestisci notifiche
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            data-testid="notifications-mark-all-button"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
            className="h-11 gap-2"
          >
            <CheckCheck className="size-4" /> Segna tutte come lette
          </Button>
        </div>
      }
    >
      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-navy">Le tue notifiche</h2>
            <p className="text-xs text-muted-foreground">Comunicazioni, aggiornamenti e avvisi del team.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span data-testid="notifications-page-total" className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-slate-600">
              <Inbox className="size-3" /> {items.length} totali
            </span>
            <span data-testid="notifications-page-unread" className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[#B53900]">
              <Bell className="size-3" /> {unread} non lette
            </span>
          </div>
        </div>

        <div className="space-y-2 p-4">
          {notifications.isPending && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Caricamento notifiche...
            </div>
          )}

          {notifications.isError && (
            <p className="py-12 text-center text-sm text-red-700">Impossibile caricare le notifiche.</p>
          )}

          {!notifications.isPending && !notifications.isError && items.length === 0 && (
            <div data-testid="notifications-page-empty" className="flex flex-col items-center gap-3 py-14 text-center text-muted-foreground">
              <span className="grid size-14 place-items-center rounded-2xl bg-muted">
                <Inbox className="size-7" />
              </span>
              <div>
                <p className="font-semibold text-navy">Nessuna notifica</p>
                <p className="text-sm">Qui compariranno le comunicazioni inviate dal super admin.</p>
              </div>
            </div>
          )}

          {items.map((item) => {
            const selected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`notifications-page-item-${item.id}`}
                onClick={() => {
                  setSelectedId(item.id);
                  if (!item.read_at) markRead.mutate(item.id);
                }}
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition-colors",
                  selected ? "border-brand bg-brand-soft/40 ring-2 ring-brand/20" : "bg-white hover:border-brand/40 hover:bg-brand-soft/20",
                  !item.read_at && !selected && "border-brand/30 bg-brand-soft/30",
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                      {item.title}
                      {!item.read_at && (
                        <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Nuova
                        </span>
                      )}
                      {item.read_at && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <CheckCheck className="size-3" /> Letta
                        </span>
                      )}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{item.body}</p>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                    <p>{dateTimeIt(item.created_at)}</p>
                    {item.sender_name && <p>Da {item.sender_name}</p>}
                    {item.read_at && <p className="mt-0.5">Letta {dateTimeIt(item.read_at)}</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </DashboardShell>
  );
}
