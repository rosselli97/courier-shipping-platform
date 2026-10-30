import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CourierLogo } from "@/components/brand";
import { apiPost } from "@/lib/api";
import { useContacts } from "@/lib/contacts";
import { cn } from "@/lib/utils";
import { BookUser } from "lucide-react";
import { eur, errorMessage } from "@/lib/format";
import type { Contact, CourierQuote, QuoteRequest, ResellerShipment, ShipmentCreate } from "@/lib/types";

interface Props {
  quote: CourierQuote | null;
  request: QuoteRequest;
  onClose: () => void;
  /** admin ships internally at cost (no wallet); reseller pays from wallet */
  role?: "admin" | "reseller";
  /** stay on the current page after creating (default: go to the shipments list) */
  onCreated?: () => void;
  /** address-book contact chosen in the calculator: pre-fills the recipient */
  prefillContactId?: string | null;
}

export default function ShipmentDialog({ quote, request, onClose, role = "reseller", onCreated, prefillContactId }: Props) {
  const isAdmin = role === "admin";
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const open = quote !== null;
  const contacts = useContacts(open);
  // only recipients at the quoted destination CAP can be used (the price depends on it)
  const book = (contacts.isError ? [] : contacts.data ?? []).filter((c) => c.cap === request.dest_cap);
  const fill = (c: Contact) => {
    setName(c.name);
    setAddress(c.address);
    setEmail(c.email ?? "");
  };
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !prefillContactId || prefilled.current === prefillContactId) return;
    const c = contacts.data?.find((x) => x.id === prefillContactId);
    if (c) {
      prefilled.current = prefillContactId;
      fill(c);
    }
  }, [open, prefillContactId, contacts.data]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: (body: ShipmentCreate) => apiPost<ResellerShipment>(isAdmin ? "/admin/shipments" : "/reseller/shipments", body),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: [isAdmin ? "admin" : "reseller"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`Spedizione ${s.tracking_code} creata`, { description: "Scarica l'etichetta PDF dall'elenco spedizioni." });
      onClose();
      if (onCreated) onCreated();
      else navigate(isAdmin ? "/admin/spedizioni" : "/dashboard");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={quote !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="shipment-create-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-navy">Dati destinatario</DialogTitle>
          <DialogDescription>Completa i dati per generare la lettera di vettura.</DialogDescription>
        </DialogHeader>
        {quote && (
          <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
            <CourierLogo courier={quote.courier} size="sm" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-navy">{quote.courier_name}</p>
              <p className="text-muted-foreground">{request.origin_cap} → {request.dest_cap} · {request.weight_kg} kg</p>
            </div>
            <p className="font-heading text-lg font-bold text-navy">{eur(quote.price)}</p>
          </div>
        )}
        {book.length > 0 && (
          <div data-testid="shipment-contact-chips">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <BookUser className="size-3.5" /> Destinatari frequenti · {request.dest_cap}
            </p>
            <div className="flex flex-wrap gap-2">
              {book.slice(0, 6).map((c) => {
                const active = name === c.name && address === c.address;
                return (
                  <button
                    type="button"
                    key={c.id}
                    data-testid="shipment-contact-chip"
                    onClick={() => fill(c)}
                    className={cn(
                      "rounded-xl border px-3 py-1.5 text-left text-xs transition-[border-color,background-color,transform] active:scale-[0.97]",
                      active ? "border-brand bg-brand-soft" : "bg-white hover:border-slate-300",
                    )}
                  >
                    <span className="block font-semibold text-navy">{c.name}</span>
                    <span className="block text-muted-foreground">{c.address} · {c.uses}×</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!quote) return;
            create.mutate({
              ...request, courier: quote.courier, recipient_name: name, recipient_address: address,
              recipient_email: email.trim() || null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rcp-name">Nome e cognome / Ragione sociale</Label>
            <Input id="rcp-name" data-testid="shipment-recipient-name-input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mario Rossi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcp-addr">Indirizzo</Label>
            <Input id="rcp-addr" data-testid="shipment-recipient-address-input" required minLength={4} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via Roma 1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcp-email">Email destinatario <span className="font-normal text-muted-foreground">(facoltativa)</span></Label>
            <Input id="rcp-email" type="email" data-testid="shipment-recipient-email-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario.rossi@email.it" />
            <p className="text-xs text-muted-foreground">Riceverà il codice e il link di tracciamento appena creata la spedizione.</p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              data-testid="shipment-create-submit-button"
              disabled={create.isPending}
              className="h-11 w-full bg-brand font-semibold text-white hover:bg-brand-hover"
            >
              {create.isPending ? "Creazione…" : isAdmin ? `Crea spedizione · costo ${quote ? eur(quote.price) : ""}` : `Conferma e paga ${quote ? eur(quote.price) : ""}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
