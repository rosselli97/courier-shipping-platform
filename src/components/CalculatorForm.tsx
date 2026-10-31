import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, BookUser, Boxes, Mail, Package, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/lib/auth";
import { useContacts } from "@/lib/contacts";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "busta", label: "Busta", sub: "0,5 kg", icon: Mail, w: "0.5", l: "30", wi: "22", h: "3", n: "1", p: "0" },
  { id: "standard", label: "Pacco", sub: "3 kg", icon: Package, w: "3", l: "40", wi: "30", h: "20", n: "1", p: "0" },
  { id: "pallet", label: "Pallet", sub: "120×80 · 150 kg", icon: Boxes, w: "150", l: "120", wi: "80", h: "100", n: "1", p: "1" },
];

/** n = number of parcels/colli, p = "1" for a pallet shipment, "0" for a parcel */
export type CalcValues = Record<"o" | "d" | "w" | "l" | "wi" | "h" | "n" | "p", string>;

export default function CalculatorForm({ onSubmit, initial }: {
  onSubmit: (v: CalcValues, contactId: string | null) => void;
  initial?: CalcValues;
}) {
  const me = useMe();
  const contacts = useContacts(!!me.data);
  const book = contacts.isError ? [] : contacts.data ?? [];
  const [contactId, setContactId] = useState<string | null>(null);
  const [form, setForm] = useState<CalcValues>(initial ?? { o: "20121", d: "00187", w: "3", l: "40", wi: "30", h: "20", n: "1", p: "0" });
  const [preset, setPreset] = useState(initial ? "" : "standard");
  const set = (k: keyof CalcValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (k === "d") setContactId(null);
    setPreset("");
  };
  const capOk = (v: string) => /^\d{5}$/.test(v);
  const piecesOk = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 1;
  const valid = capOk(form.o) && capOk(form.d) && piecesOk(form.n) && [form.w, form.l, form.wi, form.h].every((v) => Number(v) > 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid) onSubmit(form, contactId);
  };

  return (
    <motion.form
      onSubmit={submit}
      data-testid="shipping-calculator-form"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border bg-card p-5 shadow-[0_24px_60px_-20px_rgba(2,32,53,0.35)] sm:p-7"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-navy sm:text-2xl">Calcola tariffa</h2>
        <Truck className="size-6 text-brand" />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            data-testid={`calc-preset-${p.id}`}
            onClick={() => {
              setForm({ ...form, w: p.w, l: p.l, wi: p.wi, h: p.h, n: p.n, p: p.p });
              setPreset(p.id);
            }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-[border-color,background-color,transform] duration-200 active:scale-[0.97]",
              preset === p.id ? "border-brand bg-brand-soft" : "hover:border-slate-300",
            )}
          >
            <p.icon className={cn("size-5", preset === p.id ? "text-brand" : "text-slate-500")} />
            <span className="text-sm font-semibold text-navy">{p.label}</span>
            <span className="text-[11px] text-muted-foreground">{p.sub}</span>
          </button>
        ))}
      </div>

      {book.length > 0 && (
        <div className="mt-5 space-y-1.5" data-testid="calc-contact-picker">
          <Label className="flex items-center gap-1.5"><BookUser className="size-3.5 text-brand" /> Destinatario dalla rubrica</Label>
          <Select
            value={contactId ?? ""}
            onValueChange={(v: string) => {
              const c = book.find((x) => x.id === v);
              if (!c) return;
              setContactId(c.id);
              setForm((f) => ({ ...f, d: c.cap }));
            }}
          >
            <SelectTrigger data-testid="calc-contact-select" className="h-12 w-full">
              <SelectValue>
                {(v) => {
                  const c = book.find((x) => x.id === v);
                  return c ? `${c.name} · ${c.cap} ${c.city}` : <span className="text-muted-foreground">Scegli un destinatario frequente…</span>;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {book.slice(0, 15).map((c) => (
                <SelectItem key={c.id} value={c.id} data-testid={`calc-contact-option-${c.id}`}>
                  <span className="flex flex-col">
                    <span className="font-medium text-navy">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.address} · {c.cap} {c.city} · {c.uses}×</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="o">CAP partenza</Label>
          <Input id="o" inputMode="numeric" maxLength={5} data-testid="calc-origin-cap-input" value={form.o} onChange={set("o")} className="h-12 font-mono text-base" placeholder="20121" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d">CAP destinazione</Label>
          <Input id="d" inputMode="numeric" maxLength={5} data-testid="calc-dest-cap-input" value={form.d} onChange={set("d")} className="h-12 font-mono text-base" placeholder="00187" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="w">Peso totale (kg)</Label>
          <Input id="w" type="number" step="0.1" min="0.1" data-testid="calc-weight-input" value={form.w} onChange={set("w")} className="h-12 text-base" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="n">Colli</Label>
          <Input id="n" type="number" step="1" min="1" max="100" data-testid="calc-pieces-input" value={form.n} onChange={set("n")} className="h-12 text-base" />
        </div>
      </div>

      <div className="mt-4">
        <Label>Dimensioni (cm) — L × P × A</Label>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <Input aria-label="Lunghezza" type="number" min="1" data-testid="calc-dim-length-input" value={form.l} onChange={set("l")} className="h-12 text-base" />
          <Input aria-label="Larghezza" type="number" min="1" data-testid="calc-dim-width-input" value={form.wi} onChange={set("wi")} className="h-12 text-base" />
          <Input aria-label="Altezza" type="number" min="1" data-testid="calc-dim-height-input" value={form.h} onChange={set("h")} className="h-12 text-base" />
        </div>
      </div>

      <label className={cn("mt-4 flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors", form.p === "1" ? "border-brand bg-brand-soft" : "hover:border-slate-300")}>
        <Checkbox
          data-testid="calc-pallet-checkbox"
          checked={form.p === "1"}
          onCheckedChange={(v) => {
            setForm({ ...form, p: v ? "1" : "0" });
            setPreset("");
          }}
        />
        <span className="text-sm">
          <span className="font-semibold text-navy">Spedizione su pallet</span>
          <span className="block text-xs text-muted-foreground">Tariffa fissa per pallet in base alla zona, fino a 1000 kg</span>
        </span>
      </label>

      {!valid && (
        <p data-testid="calc-validation-error" className="mt-3 text-sm text-destructive">
          Inserisci CAP validi (5 cifre), colli, peso e dimensioni.
        </p>
      )}

      <Button
        type="submit"
        data-testid="calc-submit-button"
        disabled={!valid}
        className="mt-6 h-13 w-full rounded-xl bg-brand py-3.5 text-base font-semibold text-white transition-[background-color,transform] hover:bg-brand-hover active:scale-[0.99]"
      >
        Confronta corrieri <ArrowRight className="size-5" />
      </Button>
    </motion.form>
  );
}
