import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgePercent, Building2, CheckCircle2, ChevronDown, Truck, Zap } from "lucide-react";
import { BrandLogo, Chevrons } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { errorMessage } from "@/lib/format";
import type { SignupRequest, UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY = { company_name: "", vat_number: "", email: "", password: "", confirm: "", contact_name: "", phone: "", address: "" };

export default function Signup() {
  const [f, setF] = useState(EMPTY);
  const [terms, setTerms] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const vatClean = f.vat_number.replace(/\s/g, "").toUpperCase();
  const vatOk = /^(IT)?\d{11}$/.test(vatClean);
  const pwOk = f.password.length >= 8;
  const matchOk = f.password === f.confirm;
  const valid = f.company_name.trim().length >= 2 && vatOk && /\S+@\S+\.\S+/.test(f.email) && pwOk && matchOk && terms;

  const signup = useMutation({
    mutationFn: () => {
      const body: SignupRequest = {
        company_name: f.company_name.trim(),
        vat_number: vatClean,
        email: f.email.trim(),
        password: f.password,
        contact_name: f.contact_name.trim() || null,
        phone: f.phone.trim() || null,
        address: f.address.trim() || null,
        accept_terms: true,
      };
      return apiPost<UserPublic>("/auth/signup", body);
    },
    onSuccess: (u) => {
      beginSession();
      toast.success(`Account creato, benvenuto ${u.company_name}!`, { description: "Ricarica il portafoglio per iniziare a spedire." });
      const next = params.get("next");
      navigate(next && !next.startsWith("/admin") ? next : "/dashboard", { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, "Registrazione non riuscita")),
  });

  const loginHref = `/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`;

  return (
    <div className="grid min-h-screen bg-page lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-navy-dark p-12 text-white lg:flex lg:flex-col">
        <Chevrons className="pointer-events-none absolute -bottom-10 -right-20 w-[560px] text-brand/10" />
        <BrandLogo variant="white" className="h-6" />
        <div className="relative mt-auto max-w-md">
          <h2 className="font-heading text-4xl font-extrabold leading-tight">Apri il tuo account Business in 1 minuto.</h2>
          <ul className="mt-8 space-y-4 text-slate-200">
            <li className="flex gap-3"><Zap className="size-5 text-brand" /> Attivo subito, nessun canone mensile</li>
            <li className="flex gap-3"><Truck className="size-5 text-brand" /> Poste Italiane, BRT e DHL da un solo pannello</li>
            <li className="flex gap-3"><BadgePercent className="size-5 text-brand" /> Tariffe dedicate per i volumi più alti</li>
          </ul>
        </div>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden"><BrandLogo className="h-6" /></div>
          <h1 data-testid="signup-title" className="mt-8 font-heading text-3xl font-bold text-navy lg:mt-0">Registrati</h1>
          <p className="mt-1 text-muted-foreground">Crea l'account rivenditore della tua azienda.</p>

          <form
            data-testid="signup-form"
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) signup.mutate();
            }}
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="size-3.5" /> Dati aziendali
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="su-company">Ragione sociale *</Label>
              <Input id="su-company" required autoComplete="organization" data-testid="signup-company-input" value={f.company_name} onChange={set("company_name")} className="h-11 bg-white" placeholder="Rossi Logistica Srl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-vat">Partita IVA *</Label>
              <Input id="su-vat" required data-testid="signup-vat-input" value={f.vat_number} onChange={set("vat_number")} className="h-11 bg-white font-mono uppercase" placeholder="IT01234567890" />
              {f.vat_number && !vatOk && <p data-testid="signup-vat-error" className="text-xs text-destructive">11 cifre, con o senza prefisso IT.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-email">Email aziendale *</Label>
              <Input id="su-email" type="email" required autoComplete="email" data-testid="signup-email-input" value={f.email} onChange={set("email")} className="h-11 bg-white" placeholder="ordini@azienda.it" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="su-pw">Password *</Label>
                <Input id="su-pw" type="password" required autoComplete="new-password" data-testid="signup-password-input" value={f.password} onChange={set("password")} className="h-11 bg-white" />
                <p className={cn("flex items-center gap-1 text-xs", pwOk ? "text-emerald-700" : "text-muted-foreground")}>
                  <CheckCircle2 className="size-3" /> Almeno 8 caratteri
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-pw2">Conferma password *</Label>
                <Input id="su-pw2" type="password" required autoComplete="new-password" data-testid="signup-confirm-input" value={f.confirm} onChange={set("confirm")} className="h-11 bg-white" />
                {f.confirm && !matchOk && <p data-testid="signup-confirm-error" className="text-xs text-destructive">Le password non coincidono.</p>}
              </div>
            </div>

            <button
              type="button"
              data-testid="signup-extra-toggle"
              onClick={() => setShowExtra(!showExtra)}
              className="flex w-full items-center justify-between rounded-xl border border-dashed bg-white px-4 py-3 text-sm font-medium text-navy transition-colors hover:border-slate-300"
            >
              Dati aggiuntivi <span className="text-xs font-normal text-muted-foreground">(facoltativi)</span>
              <ChevronDown className={cn("ml-auto size-4 transition-transform", showExtra && "rotate-180")} />
            </button>
            {showExtra && (
              <div className="space-y-4 rounded-xl bg-white p-4 animate-fade-up" data-testid="signup-extra-section">
                <div className="space-y-1.5">
                  <Label htmlFor="su-contact">Referente</Label>
                  <Input id="su-contact" autoComplete="name" data-testid="signup-contact-input" value={f.contact_name} onChange={set("contact_name")} className="h-11" placeholder="Mario Rossi" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-phone">Telefono</Label>
                  <Input id="su-phone" type="tel" autoComplete="tel" data-testid="signup-phone-input" value={f.phone} onChange={set("phone")} className="h-11" placeholder="+39 02 1234567" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-address">Indirizzo sede</Label>
                  <Input id="su-address" autoComplete="street-address" data-testid="signup-address-input" value={f.address} onChange={set("address")} className="h-11" placeholder="Via Roma 1, 20121 Milano" />
                </div>
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600">
              <Checkbox data-testid="signup-terms-checkbox" checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
              Accetto i termini di servizio e l'informativa privacy di MUVPACK.
            </label>

            <Button type="submit" data-testid="signup-submit-button" disabled={!valid || signup.isPending} className="h-12 w-full bg-brand text-base font-semibold text-white hover:bg-brand-hover">
              {signup.isPending ? "Creazione account…" : "Crea account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Hai già un account?{" "}
            <Link to={loginHref} data-testid="signup-login-link" className="font-semibold text-brand hover:underline">Accedi</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
