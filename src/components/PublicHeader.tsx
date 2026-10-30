import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/brand";
import { useMe } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PublicHeader({ dark = false }: { dark?: boolean }) {
  const me = useMe();
  const area = me.data ? (me.data.role === "admin" ? "/admin" : "/dashboard") : "/login";
  return (
    <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <BrandLogo variant={dark ? "white" : "navy"} className="h-5 sm:h-6" />
      <div className="flex items-center gap-2">
        {!me.data && (
          <Link
            to="/registrati"
            data-testid="header-signup-link"
            className={cn(buttonVariants({ size: "sm" }), "bg-brand text-white hover:bg-brand-hover")}
          >
            Registrati
          </Link>
        )}
        <Link
          to={area}
          data-testid="header-area-link"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            dark ? "border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white" : "",
          )}
        >
          {me.data ? "La mia area" : "Accedi"}
        </Link>
      </div>
    </header>
  );
}
