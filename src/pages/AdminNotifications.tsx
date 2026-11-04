import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2, Send, Users } from "lucide-react";
import { toast } from "sonner";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api";
import { dateTimeIt, errorMessage } from "@/lib/format";
import { NOTIFICATIONS_KEY } from "@/lib/notifications";
import type {
  AdminNotificationRow,
  ClientRow,
  NotificationAudience,
  NotificationSendInput,
  NotificationSendResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const AUDIENCE_LABEL: Record<NotificationAudience, string> = {
  all: "Tutti i profili",
  resellers: "Solo clienti B2B",
  selected: "Profilo specifico",
};

export default function AdminNotifications() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const handledFocus = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<NotificationAudience>("all");
  const [recipientId, setRecipientId] = useState("");

  const clients = useQuery({
    queryKey: ["admin", "clients"],
    queryFn: () => apiGet<ClientRow[]>("/admin/clients"),
  });

  const history = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () => apiGet<AdminNotificationRow[]>("/admin/notifications"),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  };

  const send = useMutation({
    mutationFn: (payload: NotificationSendInput) =>
      apiPost<NotificationSendResult>("/admin/notifications", payload),
    onSuccess: (result) => {
      toast.success(
        result.created === 1 ? "Notifica inviata a 1 profilo" : `Notifica inviata a ${result.created} profili`,
      );
      setTitle("");
      setMessage("");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error, "Invio notifica non riuscito")),
  });

  const canSend =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    (audience !== "selected" || recipientId.length > 0);

  const rows = history.data ?? [];
  const unread = rows.filter((row) => !row.read_at).length;
  const clientsList = clients.data ?? [];

  useEffect(() => {
    if (!focusId || handledFocus.current === focusId) return;
    const element = document.getElementById(`admin-notification-${focusId}`);
    if (!element) return;
    handledFocus.current = focusId;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, history.data]);

  return (
    <DashboardShell
      role="admin"
      title="Gestione notifiche"
      subtitle="Invia comunicazioni ai profili e controlla chi ha letto le notifiche."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_1fr] xl:items-start">
        <form
          data-testid="admin-notification-form"
          className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSend) return;
            send.mutate({
              title: title.trim(),
              body: message.trim(),
              audience,
              recipient_ids: audience === "selected" && recipientId ? [recipientId] : [],
            });
          }}
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <Bell className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-lg font-semibold text-navy">Nuova notifica</h2>
              <p className="text-xs text-muted-foreground">La campanella si aggiorna su tutti i profili.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notification-audience">Destinatari</Label>
            <Select value={audience} onValueChange={(value: string) => setAudience(value as NotificationAudience)}>
              <SelectTrigger id="notification-audience" data-testid="notification-audience-select" className="h-11 w-full">
                <SelectValue>{(value) => AUDIENCE_LABEL[value as NotificationAudience] ?? "Seleziona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i profili</SelectItem>
                <SelectItem value="resellers">Solo clienti B2B</SelectItem>
                <SelectItem value="selected">Profilo specifico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audience === "selected" && (
            <div className="space-y-1.5">
              <Label htmlFor="notification-recipient">Profilo</Label>
              <Select value={recipientId} onValueChange={(value: string) => setRecipientId(value)}>
                <SelectTrigger id="notification-recipient" data-testid="notification-recipient-select" className="h-11 w-full">
                  <SelectValue>
                    {(value) =>
                      clientsList.find((client) => client.id === value)?.company_name ?? "Seleziona un profilo"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clientsList.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.company_name} · {client.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notification-title">Titolo</Label>
            <Input
              id="notification-title"
              data-testid="notification-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder="Es. Nuove tariffe disponibili"
              className="h-11"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notification-message">Messaggio</Label>
            <Textarea
              id="notification-message"
              data-testid="notification-message-input"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Scrivi il testo della notifica..."
              required
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/2000</p>
          </div>

          <Button
            type="submit"
            data-testid="notification-send-button"
            disabled={!canSend || send.isPending}
            className="h-11 w-full gap-2 bg-brand font-semibold text-white hover:bg-brand-hover"
          >
            <Send className="size-4" /> {send.isPending ? "Invio..." : "Invia notifica"}
          </Button>
        </form>

        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-lg font-semibold text-navy">Notifiche inviate</h2>
              <p className="text-xs text-muted-foreground">Storico di tutti i profili, con stato di lettura.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span data-testid="notifications-total-badge" className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-slate-600">
                <Users className="size-3" /> {rows.length} inviate
              </span>
              <span data-testid="notifications-unread-badge" className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[#B53900]">
                <Bell className="size-3" /> {unread} non lette
              </span>
            </div>
          </div>

          <Table data-testid="admin-notifications-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Destinatario</TableHead>
                <TableHead>Notifica</TableHead>
                <TableHead>Inviata</TableHead>
                <TableHead className="pr-5">Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.isPending && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" /> Caricamento...
                  </TableCell>
                </TableRow>
              )}
              {history.isError && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-red-700">
                    Impossibile caricare le notifiche.
                  </TableCell>
                </TableRow>
              )}
              {!history.isPending && !history.isError && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Nessuna notifica inviata.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  id={`admin-notification-${row.id}`}
                  data-testid={`admin-notification-row-${row.id}`}
                  className={cn(!row.read_at && "bg-brand-soft/30", focusId === row.id && "ring-2 ring-inset ring-brand/40")}
                >
                  <TableCell className="pl-5">
                    <p className="font-semibold text-navy">{row.recipient_name}</p>
                    <p className="text-xs text-muted-foreground">{row.recipient_email}</p>
                    <span className="mt-1 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {row.recipient_role}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="font-semibold text-navy">{row.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{row.body}</p>
                    {row.sender_name && <p className="mt-1 text-xs text-muted-foreground">Da {row.sender_name}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateTimeIt(row.created_at)}</TableCell>
                  <TableCell className="pr-5">
                    {row.read_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                        <CheckCheck className="size-3.5" /> Letta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-brand-soft px-2 py-1 text-xs font-semibold text-[#B53900]">
                        <Bell className="size-3.5" /> Non letta
                      </span>
                    )}
                    {row.read_at && <p className="mt-1 text-[11px] text-muted-foreground">{dateTimeIt(row.read_at)}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </DashboardShell>
  );
}
