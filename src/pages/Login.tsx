import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ShieldCheck, Wallet, FileText, BarChart3 } from "lucide-react";
import { BrandLogo, Chevrons } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { errorMessage } from "@/lib/format";
import type { UserPublic } from "@/lib/types";

const DEMO = {
  reseller: { email: "reseller@muvpack.it", password: "Reseller123!" },
  admin: { email: "admin@muvpack.it", password: "Admin123!" },
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const login = useMutation({
    mutationFn: () => apiPost<UserPublic>("/auth/login", { email, password }),
    onSuccess: (u) => {
      beginSession();
      toast.success(`Benvenuto, ${u.company_name}`);
      const next = params.get("next");
      const fallback = u.role === "admin" ? "/admin" : "/dashboard";
      navigate(next && (u.role === "reseller" || next.startsWith("/admin")) ? next : fallback, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, "Accesso non riuscito")),
  });

  return (
    <div className="grid min-h-screen bg-page lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-navy-dark p-12 text-white lg:flex lg:flex-col">
        <Chevrons className="pointer-events-none absolute -bottom-10 -right-20 w-[560px] text-brand/10" />
        <BrandLogo variant="white" className="h-6" />
        <div className="relative mt-auto max-w-md">
          <h2 className="font-heading text-4xl font-extrabold leading-tight">La piattaforma spedizioni per rivenditori B2B.</h2>
          <ul className="mt-8 space-y-4 text-slate-200">
            <li className="flex gap-3"><Wallet className="size-5 text-brand" /> Portafoglio prepagato, nessuna sorpresa</li>
            <li className="flex gap-3"><FileText className="size-5 text-brand" /> Lettere di vettura PDF istantanee</li>
            <li className="flex gap-3"><BarChart3 className="size-5 text-brand" /> Statistiche mensili e tracking centralizzato</li>
          </ul>
        </div>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden"><BrandLogo className="h-6" /></div>
          <h1 className="mt-8 font-heading text-3xl font-bold text-navy lg:mt-0">Accedi</h1>
          <p className="mt-1 text-muted-foreground">Area riservata rivenditori e amministrazione.</p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" data-testid="login-email-input" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required autoComplete="current-password" data-testid="login-password-input" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-white" />
            </div>
            <Button type="submit" data-testid="login-submit-button" disabled={login.isPending} className="h-12 w-full bg-brand text-base font-semibold text-white hover:bg-brand-hover">
              {login.isPending ? "Accesso…" : "Accedi"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Non hai un account?{" "}
            <Link
              to={`/registrati${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}
              data-testid="login-signup-link"
              className="font-semibold text-brand hover:underline"
            >
              Registrati
            </Link>
          </p>

          <div className="mt-8 rounded-2xl border border-dashed bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account demo</p>
            <div className="mt-3 grid gap-2">
              <Button type="button" variant="outline" data-testid="login-demo-reseller-button" className="h-10 justify-start" onClick={() => { setEmail(DEMO.reseller.email); setPassword(DEMO.reseller.password); }}>
                <Building2 className="size-4 text-brand" /> Accedi come Rivenditore B2B
              </Button>
              <Button type="button" variant="outline" data-testid="login-demo-admin-button" className="h-10 justify-start" onClick={() => { setEmail(DEMO.admin.email); setPassword(DEMO.admin.password); }}>
                <ShieldCheck className="size-4 text-navy" /> Accedi come Super Admin
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
