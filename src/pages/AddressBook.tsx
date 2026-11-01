import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookUser, Pencil, Plus, Search, Trash2 } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiPost, apiPut } from "@/lib/api";
import { useContacts } from "@/lib/contacts";
import { dateIt, errorMessage } from "@/lib/format";
import type { Contact, ContactInput } from "@/lib/types";

const EMPTY = { name: "", address: "", cap: "", email: "" };

function ContactForm({ initial, onDone }: { initial: Contact | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial ? { name: initial.name, address: initial.address, cap: initial.cap, email: initial.email ?? "" } : EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const capOk = /^\d{5}$/.test(f.cap);
  const valid = f.name.trim().length >= 2 && f.address.trim().length >= 4 && capOk;

  const save = useMutation({
    mutationFn: () => {
      const body: ContactInput = { name: f.name.trim(), address: f.address.trim(), cap: f.cap, email: f.email.trim() || null };
      return initial ? apiPut<Contact>(`/contacts/${initial.id}`, body) : apiPost<Contact>("/contacts", body);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(initial ? `${c.name} aggiornato` : `${c.name} aggiunto alla rubrica`);
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ct-name">Nome e cognome / Ragione sociale *</Label>
        <Input id="ct-name" required data-testid="contact-name-input" value={f.name} onChange={set("name")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ct-address">Indirizzo *</Label>
        <Input id="ct-address" required data-testid="contact-address-input" value={f.address} onChange={set("address")} placeholder="Via Roma 1" />
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ct-cap">CAP *</Label>
          <Input id="ct-cap" required inputMode="numeric" maxLength={5} data-testid="contact-cap-input" value={f.cap} onChange={set("cap")} className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ct-email">Email <span className="font-normal text-muted-foreground">(facoltativa)</span></Label>
          <Input id="ct-email" type="email" data-testid="contact-email-input" value={f.email} onChange={set("email")} />
        </div>
      </div>
      {f.cap && !capOk && <p data-testid="contact-cap-error" className="text-xs text-destructive">Il CAP deve avere 5 cifre.</p>}
      <DialogFooter>
        <Button type="submit" data-testid="contact-save-button" disabled={!valid || save.isPending} className="h-11 w-full bg-brand text-white hover:bg-brand-hover">
          {initial ? "Salva modifiche" : "Aggiungi contatto"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function AddressBook({ role }: { role: "admin" | "reseller" }) {
  const qc = useQueryClient();
  const contacts = useContacts(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const list = contacts.isError ? [] : contacts.data ?? [];
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return list.filter((c) => !s || [c.name, c.address, c.city, c.cap, c.email ?? ""].some((v) => v.toLowerCase().includes(s)));
  }, [list, search]);

  const remove = useMutation({
    mutationFn: (c: Contact) => apiDelete<{ ok: boolean }>(`/contacts/${c.id}`),
    onSuccess: (_r, c) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`${c.name} eliminato dalla rubrica`);
      setDeleting(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <DashboardShell
      role={role}
      title="Rubrica"
      subtitle="Contatti mittenti e destinatari sincronizzati da TravelBox. Puoi aggiungerli, modificarli o eliminarli."
      actions={
        <Button data-testid="contact-add-button" onClick={() => setEditing("new")} className="h-11 bg-brand px-5 font-semibold text-white hover:bg-brand-hover">
          <Plus className="size-4" /> Nuovo contatto
        </Button>
      }
    >
      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
            <BookUser className="size-5 text-brand" /> {list.length} contatti
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="contact-search-input" aria-label="Cerca contatto" placeholder="Nome, indirizzo, città, CAP" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9 sm:w-72" />
          </div>
        </div>
        <Table data-testid="contacts-table">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Contatto</TableHead>
              <TableHead>Indirizzo</TableHead>
              <TableHead>CAP / Città</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Spedizioni</TableHead>
              <TableHead>Ultimo uso</TableHead>
              <TableHead className="pr-5 text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.isPending && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Caricamento…</TableCell></TableRow>
            )}
            {!contacts.isPending && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} data-testid="contacts-empty" className="py-10 text-center text-muted-foreground">
                {list.length ? "Nessun contatto corrisponde alla ricerca." : "La rubrica è vuota: aggiungi un contatto o crea una spedizione."}
              </TableCell></TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={c.id} data-testid="contact-row" className="transition-colors hover:bg-muted/50">
                <TableCell className="pl-5 font-semibold text-navy">{c.name}</TableCell>
                <TableCell className="text-sm">{c.address}</TableCell>
                <TableCell className="text-sm"><span className="font-mono">{c.cap}</span> {c.city}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.email ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-navy">{c.uses}×</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.uses ? dateIt(c.last_used_at) : "Mai usato"}</TableCell>
                <TableCell className="pr-5 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Modifica ${c.name}`} data-testid="contact-edit-button" onClick={() => setEditing(c)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Elimina ${c.name}`} data-testid="contact-delete-button" onClick={() => setDeleting(c)} className="hover:text-destructive">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="contact-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">{editing === "new" ? "Nuovo contatto" : "Modifica contatto"}</DialogTitle>
            <DialogDescription>Il CAP determina la tariffa: verrà proposto solo per spedizioni verso quel CAP.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <ContactForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent data-testid="contact-delete-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-navy">Eliminare il contatto?</DialogTitle>
            <DialogDescription>
              {deleting?.name} verrà rimosso dalla rubrica. Le spedizioni già create non cambiano.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" data-testid="contact-delete-cancel" onClick={() => setDeleting(null)}>Annulla</Button>
            <Button data-testid="contact-delete-confirm" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)} className="bg-destructive text-white hover:bg-destructive/90">
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
