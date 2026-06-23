import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock3, Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";

const LOGIN_VERSION = "Login v8.5 · compacto + wordmark letras · 17/06/2026 17:25";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Iniciar sesión — grup mar.time" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Credenciales incorrectas. Verifique su email y contraseña."
          : error.message,
      );
      return;
    }

    nav({ to: "/" });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f1f0ee] text-[#111111]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-44 h-[560px] w-[560px] rounded-full bg-white/95 blur-3xl" />
        <div className="absolute right-[-230px] top-[4%] h-[600px] w-[600px] rounded-full bg-white/85 blur-3xl" />
        <div className="absolute bottom-[-250px] left-[4%] h-[620px] w-[620px] rounded-full bg-white/90 blur-3xl" />
        <div className="absolute bottom-[8%] right-[-90px] h-[370px] w-[370px] rounded-full border border-white/70" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,.95),rgba(255,255,255,.38)_36%,rgba(255,255,255,0)_66%)]" />
      </div>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-8">
        <section className="relative w-full max-w-[560px] rounded-[42px] border border-white/95 bg-white/70 px-6 py-7 shadow-[0_42px_115px_rgba(0,0,0,0.18)] backdrop-blur-2xl sm:px-10 sm:py-9">
          <div className="mx-auto flex max-w-[420px] flex-col items-center text-center">
            <img
              src="/grupmar-time-wordmark.png"
              alt="grup mar.time - Control horario empresarial"
              className="h-auto w-[300px] max-w-[86%] select-none object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.08)]"
              draggable={false}
            />

            <div className="my-6 flex w-full items-center gap-6 text-neutral-300">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-200 to-neutral-200" />
              <div className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-400 shadow-[0_10px_22px_rgba(0,0,0,0.08)]">
                <Clock3 className="h-4 w-4" />
              </div>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent via-neutral-200 to-neutral-200" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mx-auto max-w-[420px] space-y-4">
            <div className="space-y-2 text-left">
              <Label htmlFor="email" className="text-sm font-black text-neutral-950">Correo</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  autoFocus
                  className="h-12 rounded-[1.1rem] border-neutral-200 bg-white/88 pl-12 text-base shadow-[inset_0_2px_10px_rgba(0,0,0,0.035)] focus-visible:ring-neutral-950"
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <Label htmlFor="password" className="text-sm font-black text-neutral-950">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 rounded-[1.1rem] border-neutral-200 bg-white/88 px-12 text-base shadow-[inset_0_2px_10px_rgba(0,0,0,0.035)] focus-visible:ring-neutral-950"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-950"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="rounded-2xl text-left">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="mt-2 h-13 w-full rounded-[1.1rem] bg-neutral-950 text-sm font-black text-white shadow-[0_18px_38px_rgba(0,0,0,0.28)] transition hover:bg-black hover:shadow-[0_24px_50px_rgba(0,0,0,0.33)]"
              disabled={loading}
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>

            <div className="flex items-start justify-center gap-2 pt-2 text-center text-xs text-neutral-400">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Tus datos están protegidos. La IP, navegador y ubicación pueden registrarse según política interna.</p>
            </div>
          </form>

          <footer className="mx-auto mt-5 max-w-[420px] border-t border-neutral-200/90 pt-4 text-center text-xs text-neutral-400">
            <div>© 2026 grup mar.time · Todos los derechos reservados</div>
            <div className="mt-2 inline-flex rounded-full border border-neutral-200 bg-white/80 px-3 py-1 font-medium">{LOGIN_VERSION}</div>
          </footer>
        </section>
      </main>
    </div>
  );
}
