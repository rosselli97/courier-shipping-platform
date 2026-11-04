import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMe } from "@/lib/auth";
import { dateTimeIt } from "@/lib/format";
import { useNotificationActions, useNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export default function NotificationBell({ className }: { className?: string }) {
  const me = useMe();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { markRead, markAll } = useNotificationActions();

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;
  const target = me.data?.role === "admin" ? "/admin/notifiche" : "/notifiche";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="notification-bell"
        aria-label={unread > 0 ? `Notifiche, ${unread} non lette` : "Notifiche"}
        className={cn(
          "relative grid size-10 place-items-center rounded-lg border bg-white text-navy transition-colors hover:border-brand/50 hover:bg-brand-soft",
          className,
        )}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-5 text-white shadow">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-heading text-sm font-semibold text-navy">Notifiche</p>
            <p className="text-xs text-muted-foreground">
              {unread > 0 ? `${unread} non lette` : "Tutto letto"}
            </p>
          </div>
          <button
            type="button"
            data-testid="notification-see-all"
            onClick={() => navigate(target)}
            className="text-xs font-semibold text-brand transition-colors hover:text-brand-hover"
          >
            Vedi tutte
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {notifications.isPending ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Caricamento...</p>
          ) : items.length === 0 ? (
            <p data-testid="notification-empty" className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nessuna notifica
            </p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                data-testid={`notification-item-${item.id}`}
                onClick={() => {
                  if (!item.read_at) markRead.mutate(item.id);
                  navigate(`${target}?focus=${encodeURIComponent(item.id)}`);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-1 rounded-lg px-3 py-2.5",
                  !item.read_at && "bg-brand-soft/60",
                )}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-navy">{item.title}</span>
                  {!item.read_at && <span className="mt-1 size-2 shrink-0 rounded-full bg-brand" />}
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-slate-600">{item.body}</span>
                <span className="text-[11px] text-muted-foreground">
                  {dateTimeIt(item.created_at)}
                  {item.sender_name ? ` · ${item.sender_name}` : ""}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator />
        {unread > 0 && (
          <DropdownMenuItem
            data-testid="notification-mark-all"
            onClick={() => markAll.mutate()}
            className="justify-center text-xs font-semibold text-brand"
          >
            Segna tutte come lette
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
