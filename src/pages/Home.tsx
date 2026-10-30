import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Box, Search, ShieldCheck, Timer } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import CalculatorForm from "@/components/CalculatorForm";
import { Chevrons, CourierLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  return (
    <div className="min-h-screen bg-page">
      {/* hero */}
      <section data-testid="home-hero-section" className="relative overflow-hidden bg-navy-dark pb-40 text-white sm:pb-44">
        <Chevrons className="pointer-events-none absolute -right-16 top-10 w-[420px] text-brand/10 sm:w-[620px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(8,75,117,0.9),transparent_60%)]" />
        <PublicHeader dark />
        <div className="relative z-10 mx-auto max-w-6xl px-5 pt-6 sm:pt-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/15 px-3 py-1 text-xs font-semibold text-orange-200">
            <Chevrons className="h-2.5 w-auto animate-chevron-drift text-brand" /> Poste · BRT · DHL in un unico posto
          </span>
          <h1 className="mt-5 max-w-2xl font-heading text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Spedisci in tutta Italia, <span className="text-brand">al prezzo giusto.</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-slate-300 sm:text-lg">
            Confronta i corrieri in tempo reale, crea la lettera di vettura e traccia ogni pacco.
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-32 grid max-w-6xl gap-5 px-4 pb-16 sm:-mt-36 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        {/* calculator */}
        <CalculatorForm onSubmit={(v, c) => navigate(`/spedisci?${new URLSearchParams(c ? { ...v, c } : v).toString()}`)} />

        <div className="space-y-5">
          {/* tracking */}
          <motion.form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) navigate(`/traccia/${encodeURIComponent(code.trim().toUpperCase())}`);
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6"
          >
            <h2 className="font-heading text-lg font-bold text-navy">Traccia spedizione</h2>
            <p className="text-sm text-muted-foreground">Prova con <button type="button" data-testid="quick-track-demo-code" className="font-mono font-semibold text-brand underline-offset-2 hover:underline" onClick={() => setCode("MVP20260001")}>MVP20260001</button></p>
            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input data-testid="quick-track-input" aria-label="Codice di tracking" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Codice tracking" className="h-12 pl-9 font-mono uppercase" />
              </div>
              <Button type="submit" data-testid="quick-track-submit-button" className="h-12 bg-navy px-5 text-white hover:bg-navy-light">
                Traccia
              </Button>
            </div>
          </motion.form>

          <div className="rounded-3xl bg-navy p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-200">I nostri partner</p>
            <div className="mt-4 flex gap-3">
              <CourierLogo courier="poste" />
              <CourierLogo courier="brt" />
              <CourierLogo courier="dhl" />
            </div>
            <ul className="mt-6 space-y-3 text-sm text-slate-200">
              <li className="flex items-center gap-3"><Timer className="size-4 text-brand" /> Consegna da 24h in tutta Italia</li>
              <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-brand" /> Prezzi trasparenti, IVA esclusa</li>
              <li className="flex items-center gap-3"><Box className="size-4 text-brand" /> Etichetta PDF pronta in un clic</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
