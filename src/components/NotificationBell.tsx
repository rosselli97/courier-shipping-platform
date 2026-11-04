import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export default function NotificationBell({ className }: { className?: string }) {
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;

  return (
    <Link
      to="/notifiche"
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
    </Link>
  );
}
