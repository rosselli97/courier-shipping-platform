import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CourierLogo } from "@/components/brand";
import { apiPost } from "@/lib/api";
import { useContacts } from "@/lib/contacts";
import { cn } from "@/lib/utils";
import { BookUser, CheckCircle2, Download } from "lucide-react";
import { eur, errorMessage } from "@/lib/format";
import { tbCheckout, tbCheckoutLabelHref, type TravelBoxCheckoutResult } from "@/lib/travelbox";
import type { Contact, CourierQuote, QuoteParty, QuoteRequest, ResellerShipment, ShipmentCreate } from "@/lib/types";

function nextPickupDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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
  /** TravelBox sender data coming from the quote */
  sender?: QuoteParty | null;
}

export default function ShipmentDialog({ quote, request, onClose, role = "reseller", onCreated, prefillContactId, sender }: Props) {
  const isAdmin = role === "admin";
  const originLabel = [request.origin_cap, request.origin_city].filter(Boolean).join(" ");
  const destLabel = [request.dest_cap, request.dest_city].filter(Boolean).join(" ");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [description, setDescription] = useState("");
  const [pickupDate, setPickupDate] = useState(nextPickupDate);
  const [pickupSlot, setPickupSlot] = useState<"9-12" | "12-15" | "15-18" | "18-21">("9-12");
  const [tbResult, setTbResult] = useState<TravelBoxCheckoutResult | null>(null);
  const open = quote !== null;
  useEffect(() => {
    if (!open) setTbResult(null);
  }, [open]);
  useEffect(() => {
    if (!open || quote?.source !== "travelbox") return;
    setDescription("");
    setPickupDate(nextPickupDate());
    setPickupSlot("9-12");
  }, [open, quote?.source]);
  useEffect(() => {
    if (!open || quote?.source !== "travelbox") return;
    setSenderName(sender?.name ?? "");
    setSenderAddress(sender?.street ?? "");
    setSenderEmail(sender?.email ?? "");
    setSenderPhone(sender?.phone ?? "");
    setSenderContact(sender?.contact ?? sender?.name ?? "");
  }, [open, quote?.source, sender?.name, sender?.street, sender?.email, sender?.phone, sender?.contact]);
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

  const createTravelBox = useMutation({
    mutationFn: (body: Parameters<typeof tbCheckout>[0]) => tbCheckout(body),
    onSuccess: (result) => {
      setTbResult(result);
      qc.invalidateQueries({ queryKey: ["tb"] });
      qc.invalidateQueries({ queryKey: [isAdmin ? "admin" : "reseller"] });
      toast.success(`Spedizione ${result.reference ?? ""} aggiunta al carrello TravelBox`, {
        description: "Nessun pagamento eseguito: completa il checkout sul portale.",
      });
    },
    onError: (e) => toast.error(errorMessage(e, "Creazione TravelBox non riuscita")),
  });

  return (
    <Dialog open={quote !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="shipment-create-dialog" className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-navy">
            {quote?.source === "travelbox" ? "Dati mittente e destinatario" : "Dati destinatario"}
          </DialogTitle>
          <DialogDescription>
            {quote?.source === "travelbox"
              ? "Completa i dati della spedizione: verrà creata nel carrello TravelBox, senza pagamento."
              : "Completa i dati per generare la lettera di vettura."}
          </DialogDescription>
        </DialogHeader>
        {tbResult ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Spedizione creata in carrello TravelBox</p>
                <p>{tbResult.message}</p>
              </div>
            </div>
            {(tbResult.reference || tbResult.tracking_number) && (
              <div className="rounded-xl bg-muted p-4 text-sm">
                {tbResult.reference && <p className="font-semibold text-navy">{tbResult.reference}</p>}
                {tbResult.tracking_number && (
                  <p className="text-muted-foreground">Tracking: <span className="font-mono">{tbResult.tracking_number}</span></p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Nessun pagamento eseguito: la spedizione è nel carrello TravelBox. Completa il checkout sul portale.
            </p>
            <DialogFooter className="gap-2">
              {tbCheckoutLabelHref(tbResult) && (
                <a href={tbCheckoutLabelHref(tbResult)!} download className={cn(buttonVariants(), "h-11 gap-2 bg-navy text-white hover:bg-navy-light")}>
                  <Download className="size-4" /> Etichetta PDF
                </a>
              )}
              <Button variant="outline" onClick={onClose} className="h-11">Chiudi</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
        {quote && (
          <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
            <CourierLogo courier={quote.courier} size="sm" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-navy">{quote.courier_name}</p>
              <p className="text-muted-foreground">{originLabel} → {destLabel} · {request.pieces} colli - {request.weight_kg} kg</p>
            </div>
            <div className="text-right">
              <p className="font-heading text-lg font-bold text-navy">{eur(quote.price)}</p>
              <p className="text-[11px] text-muted-foreground">{quote.price_includes_vat ? "IVA inclusa" : "IVA esclusa"}</p>
            </div>
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
            if (quote.source === "travelbox") {
              if (!quote.id) {
                toast.error("Offerta TravelBox senza identificativo: ricalcola il preventivo");
                return;
              }
              createTravelBox.mutate({
                origin_cap: request.origin_cap,
                dest_cap: request.dest_cap,
                origin_city: request.origin_city ?? null,
                dest_city: request.dest_city ?? null,
                weight_kg: request.weight_kg,
                length_cm: request.length_cm,
                width_cm: request.width_cm,
                height_cm: request.height_cm,
                pieces: request.pieces,
                is_pallet: request.is_pallet,
                offer_id: quote.id,
                recipient_name: name,
                recipient_address: address,
                recipient_email: email.trim() || null,
                recipient_phone: phone.trim() || null,
                recipient_contact: contact.trim() || null,
                sender_name: senderName.trim() || null,
                sender_address: senderAddress.trim() || null,
                sender_email: senderEmail.trim() || null,
                sender_phone: senderPhone.trim() || null,
                sender_contact: senderContact.trim() || null,
                description: description.trim() || null,
                pickup_date: pickupDate || null,
                pickup_slot: pickupSlot,
                confirm: true,
              });
              return;
            }
            create.mutate({
              ...request, courier: quote.courier, recipient_name: name, recipient_address: address,
              recipient_email: email.trim() || null,
            });
          }}
        >
          {quote?.source === "travelbox" && (
            <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dati mittente</p>
                <span className="text-[11px] text-muted-foreground">
                  CAP {request.origin_cap}
                  {request.origin_city ? ` · ${request.origin_city}` : sender?.city ? ` · ${sender.city}` : ""}
                  {sender?.province ? ` ${sender.province}` : ""}
                </span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="snd-name">Cognome e nome / Ragione sociale</Label>
                <Input id="snd-name" required minLength={2} maxLength={35} data-testid="shipment-sender-name-input" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Alessio Rosselli" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="snd-addr">Indirizzo</Label>
                <Input id="snd-addr" required minLength={4} maxLength={35} data-testid="shipment-sender-address-input" value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} placeholder="Via Roma 1" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="snd-email">Email</Label>
                  <Input id="snd-email" type="email" maxLength={50} data-testid="shipment-sender-email-input" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="mittente@email.it" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="snd-phone">Telefono</Label>
                  <Input id="snd-phone" type="tel" required minLength={8} maxLength={13} data-testid="shipment-sender-phone-input" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="333 1234567" />
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dati destinatario</p>
            <span className="text-[11px] text-muted-foreground">CAP {request.dest_cap}{request.dest_city ? ` · ${request.dest_city}` : ""}</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcp-name">Nome e cognome / Ragione sociale</Label>
            <Input id="rcp-name" data-testid="shipment-recipient-name-input" required minLength={2} maxLength={35} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mario Rossi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcp-addr">Indirizzo</Label>
            <Input id="rcp-addr" data-testid="shipment-recipient-address-input" required minLength={4} maxLength={35} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via Roma 1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rcp-email">Email destinatario <span className="font-normal text-muted-foreground">(facoltativa)</span></Label>
            <Input id="rcp-email" type="email" maxLength={50} data-testid="shipment-recipient-email-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario.rossi@email.it" />
            <p className="text-xs text-muted-foreground">Riceverà il codice e il link di tracciamento appena creata la spedizione.</p>
          </div>
          {quote?.source === "travelbox" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rcp-phone">Telefono destinatario</Label>
                <Input id="rcp-phone" type="tel" required minLength={8} maxLength={13} data-testid="shipment-recipient-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="333 1234567" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rcp-contact">Contatto</Label>
                <Input id="rcp-contact" maxLength={35} data-testid="shipment-recipient-contact-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Referente" />
              </div>
              <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dettagli spedizione</p>
                <div className="space-y-1.5">
                  <Label htmlFor="tb-description">Descrizione beni</Label>
                  <Textarea id="tb-description" rows={2} required maxLength={25} data-testid="shipment-description-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Documenti, abbigliamento, ricambi…" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tb-pickup-date">Data ritiro</Label>
                    <Input id="tb-pickup-date" type="date" required min={nextPickupDate()} data-testid="shipment-pickup-date-input" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fascia oraria</Label>
                    <Select value={pickupSlot} onValueChange={(v: string) => setPickupSlot(v as typeof pickupSlot)}>
                      <SelectTrigger data-testid="shipment-pickup-slot-select" className="h-10 w-full">
                        <SelectValue>{(v) => v}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9-12">9:00 - 12:00</SelectItem>
                        <SelectItem value="12-15">12:00 - 15:00</SelectItem>
                        <SelectItem value="15-18">15:00 - 18:00</SelectItem>
                        <SelectItem value="18-21">18:00 - 21:00</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <p className="rounded-xl bg-brand-soft px-3 py-2 text-xs text-brand">
                Verrà creata sul portale TravelBox e messa nel carrello. Nessun pagamento automatico.
              </p>
            </>
          )}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="shipment-create-submit-button"
              disabled={create.isPending || createTravelBox.isPending}
              className="h-11 w-full bg-brand font-semibold text-white hover:bg-brand-hover"
            >
              {create.isPending || createTravelBox.isPending
                ? "Creazione…"
                : quote?.source === "travelbox"
                  ? `Crea spedizione TravelBox · ${quote ? eur(quote.price) : ""}`
                  : isAdmin
                    ? `Crea spedizione · costo ${quote ? eur(quote.price) : ""}`
                    : `Conferma e paga ${quote ? eur(quote.price) : ""}`}
            </Button>
          </DialogFooter>
        </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
