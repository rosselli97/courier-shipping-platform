import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "motion/react";
import { CheckCircle2, Headset, LifeBuoy, MessageSquarePlus, Package, RotateCcw, Send } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { dateTimeIt, errorMessage } from "@/lib/format";
import type { TicketCategory, TicketCreate, TicketDetail, TicketStatus, TicketSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY: Record<TicketCategory, string> = {
  ritardo: "Ritardo consegna",
  danno: "Pacco danneggiato",
  smarrito: "Pacco smarrito",
  fatturazione: "Fatturazione e pagamenti",
  account: "Account e accesso",
  altro: "Altro",
};
const STATUS: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: "Aperto", cls: "bg-brand-soft text-[#B53900] border-orange-200" },
  answered: { label: "Risposto", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  closed: { label: "Chiuso", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};
const FILTERS: { id: "all" | TicketStatus; label: string }[] = [
  { id: "all", label: "Tutti" },
  { id: "open", label: "Aperti" },
  { id: "answered", label: "Risposti" },
  { id: "closed", label: "Chiusi" },
];

function StatusPill({ status }: { status: TicketStatus }) {
  return (
    <span data-testid="ticket-status-badge" className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS[status].cls)}>
      {STATUS[status].label}
    </span>
  );
}

function NewTicketDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<{ subject: string; category: TicketCategory; tracking: string; message: string }>({
    subject: "", category: "ritardo", tracking: "", message: "",
  });
  const valid = f.subject.trim().length >= 4 && f.message.trim().length >= 10;
  const create = useMutation({
    mutationFn: () => {
      const body: TicketCreate = { subject: f.subject.trim(), category: f.category, tracking_code: f.tracking.trim() || null, message: f.message.trim() };
      return apiPost<TicketDetail>("/tickets", body);
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(`Ticket #${t.number} aperto`, { description: "Ti risponderemo il prima possibile." });
      setF({ subject: "", category: "ritardo", tracking: "", message: "" });
      onOpenChange(false);
      onCreated(t.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ticket-new-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-navy">Nuovo ticket di assistenza</DialogTitle>
          <DialogDescription>Descrivi il problema: il nostro team ti risponderà qui e via email.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Select value={f.category} onValueChange={(v: string) => setF({ ...f, category: v as TicketCategory })}>
                <SelectTrigger data-testid="ticket-category-select" className="h-10 w-full">
                  <SelectValue>{(v) => CATEGORY[v as TicketCategory]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY) as TicketCategory[]).map((c) => (
                    <SelectItem key={c} value={c} data-testid={`ticket-category-option-${c}`}>{CATEGORY[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-tracking">Codice spedizione <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
              <Input id="tk-tracking" data-testid="ticket-tracking-input" value={f.tracking} onChange={(e) => setF({ ...f, tracking: e.target.value })} placeholder="MVP…" className="h-10 font-mono uppercase" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-subject">Oggetto *</Label>
            <Input id="tk-subject" required data-testid="ticket-subject-input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-message">Messaggio *</Label>
            <Textarea id="tk-message" required rows={5} data-testid="ticket-message-input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Almeno 10 caratteri" />
          </div>
          <DialogFooter>
            <Button type="submit" data-testid="ticket-create-submit" disabled={!valid || create.isPending} className="h-11 w-full bg-brand text-white hover:bg-brand-hover">
              <Send className="size-4" /> Invia ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketThread({ id, role }: { id: string; role: "admin" | "reseller" }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const ticket = useQuery({
    queryKey: ["tickets", id],
    queryFn: async () => {
      const t = await apiGet<TicketDetail>(`/tickets/${id}`);
      qc.invalidateQueries({ queryKey: ["tickets", "list"] }); // unread flag cleared server-side
      return t;
    },
  });
  const after = (t: TicketDetail, msg: string) => {
    qc.setQueryData(["tickets", id], t);
    qc.invalidateQueries({ queryKey: ["tickets", "list"] });
    toast.success(msg);
  };
  const send = useMutation({
    mutationFn: () => apiPost<TicketDetail>(`/tickets/${id}/messages`, { body: reply.trim() }),
    onSuccess: (t) => { setReply(""); after(t, role === "admin" ? "Risposta inviata al cliente" : "Messaggio inviato"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setStatus = useMutation({
    mutationFn: (status: TicketStatus) => apiPatch<TicketDetail>(`/tickets/${id}/status`, { status }),
    onSuccess: (t) => after(t, t.status === "closed" ? `Ticket #${t.number} chiuso` : `Ticket #${t.number} riaperto`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const t = ticket.isError ? undefined : ticket.data;
  if (!t) {
    return <div className="h-full min-h-[420px] animate-pulse rounded-2xl bg-muted" data-testid="ticket-thread-loading" />;
  }
  return (
    <div data-testid="ticket-thread" className="flex h-full min-h-[520px] flex-col rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">#{t.number} · {CATEGORY[t.category]}{role === "admin" && ` · ${t.client_name}`}</p>
            <h2 data-testid="ticket-thread-subject" className="mt-1 font-heading text-xl font-semibold text-navy">{t.subject}</h2>
            {t.tracking_code && (
              <Link to={`/traccia/${t.tracking_code}`} data-testid="ticket-tracking-link" className="mt-1 inline-flex items-center gap-1 font-mono text-xs font-semibold text-navy hover:text-brand">
                <Package className="size-3.5" /> {t.tracking_code}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={t.status} />
            {t.status !== "closed" ? (
              <Button variant="outline" size="sm" data-testid="ticket-close-button" disabled={setStatus.isPending} onClick={() => setStatus.mutate("closed")}>
                <CheckCircle2 className="size-3.5" /> {role === "admin" ? "Chiudi" : "Problema risolto"}
              </Button>
            ) : role === "admin" ? (
              <Button variant="outline" size="sm" data-testid="ticket-reopen-button" disabled={setStatus.isPending} onClick={() => setStatus.mutate("open")}>
                <RotateCcw className="size-3.5" /> Riapri
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5" data-testid="ticket-messages">
        {t.messages.map((m, i) => {
          const mine = m.author_role === role;
          return (
            <motion.div
              key={m.id}
              data-testid="ticket-message"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-3", mine ? "rounded-br-md bg-navy text-white" : "rounded-bl-md bg-muted text-navy")}>
                <p className={cn("flex items-center gap-1.5 text-xs font-semibold", mine ? "text-orange-200" : "text-muted-foreground")}>
                  {m.author_role === "admin" && <Headset className="size-3" />} {m.author_name} · {dateTimeIt(m.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
      <form
        className="border-t p-4"
        onSubmit={(e) => { e.preventDefault(); if (reply.trim().length >= 2) send.mutate(); }}
      >
        {t.status === "closed" && role === "reseller" && (
          <p className="mb-2 text-xs text-muted-foreground">Ticket chiuso: scrivendo un nuovo messaggio verrà riaperto.</p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            data-testid="ticket-reply-input"
            aria-label="Scrivi una risposta"
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={role === "admin" ? "Rispondi al cliente…" : "Scrivi un messaggio…"}
            className="min-h-[52px] flex-1 resize-none"
          />
          <Button type="submit" data-testid="ticket-reply-submit" disabled={reply.trim().length < 2 || send.isPending} className="h-[52px] bg-brand px-5 text-white hover:bg-brand-hover">
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function Support({ role }: { role: "admin" | "reseller" }) {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<"all" | TicketStatus>("all");
  const [newOpen, setNewOpen] = useState(false);
  const tickets = useQuery({ queryKey: ["tickets", "list"], queryFn: () => apiGet<TicketSummary[]>("/tickets"), refetchInterval: 30_000 });
  const list = tickets.isError ? [] : tickets.data ?? [];
  const rows = useMemo(() => list.filter((t) => filter === "all" || t.status === filter), [list, filter]);
  const selectedId = params.get("t") ?? rows[0]?.id ?? null;
  const select = (id: string) => setParams({ t: id }, { replace: true });
  const counts = { open: list.filter((t) => t.status === "open").length, unread: list.filter((t) => t.unread).length };

  return (
    <DashboardShell
      role={role}
      title="Assistenza"
      subtitle={role === "admin" ? `${counts.open} ticket aperti · ${counts.unread} da leggere` : "Apri un ticket per ritardi, danni, fatturazione o qualsiasi dubbio."}
      actions={role === "reseller" ? (
        <Button data-testid="ticket-new-button" onClick={() => setNewOpen(true)} className="h-11 bg-brand px-5 font-semibold text-white hover:bg-brand-hover">
          <MessageSquarePlus className="size-4" /> Nuovo ticket
        </Button>
      ) : undefined}
    >
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border bg-card shadow-sm" data-testid="ticket-list">
          <div className="flex gap-1 border-b p-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                data-testid={`ticket-filter-${f.id}`}
                onClick={() => setFilter(f.id)}
                className={cn("flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors", filter === f.id ? "bg-navy text-white" : "text-muted-foreground hover:bg-muted")}
              >
                {f.label}
              </button>
            ))}
          </div>
          <ul className="max-h-[620px] overflow-y-auto p-2">
            {tickets.isPending && [0, 1, 2].map((i) => <li key={i} className="m-1 h-20 animate-pulse rounded-xl bg-muted" />)}
            {!tickets.isPending && rows.length === 0 && (
              <li data-testid="ticket-list-empty" className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <LifeBuoy className="size-8 text-slate-300" />
                {role === "reseller" ? "Nessun ticket. Serve aiuto? Apri un nuovo ticket." : "Nessun ticket in questa vista."}
              </li>
            )}
            {rows.map((t) => (
              <li key={t.id}>
                <button
                  data-testid={`ticket-item-${t.number}`}
                  onClick={() => select(t.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-3 text-left transition-colors",
                    selectedId === t.id ? "bg-brand-soft" : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">#{t.number}{role === "admin" && ` · ${t.client_name}`}</span>
                    <StatusPill status={t.status} />
                  </div>
                  <p className={cn("mt-1 flex items-center gap-1.5 truncate text-sm text-navy", t.unread ? "font-bold" : "font-medium")}>
                    {t.unread && <span data-testid="ticket-unread-dot" className="size-2 shrink-0 rounded-full bg-brand" />}
                    {t.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.last_message_preview}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{CATEGORY[t.category]} · {dateTimeIt(t.updated_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {selectedId ? (
          <TicketThread key={selectedId} id={selectedId} role={role} />
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed bg-card text-sm text-muted-foreground">
            Seleziona un ticket per vedere la conversazione.
          </div>
        )}
      </div>
      {role === "reseller" && <NewTicketDialog open={newOpen} onOpenChange={setNewOpen} onCreated={select} />}
    </DashboardShell>
  );
}
