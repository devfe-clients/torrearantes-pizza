import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { Loader2, Lock } from "lucide-react";
import logoAsset from "@/assets/logo.jpg.asset.json";
import { getFirebase, isFirebaseConfigured } from "@/lib/firebase";

export function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      if (user) void navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { auth } = getFirebase();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      void navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 rounded-3xl p-6">
        <img src={logoAsset.url} alt="Pizzaria Torre Arantes" className="mx-auto h-20 w-auto" />
        <h1 className="text-center text-lg">Painel administrativo</h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          maxLength={120}
          className="w-full rounded-xl border border-input bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          maxLength={72}
          className="w-full rounded-xl border border-input bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Entrar
        </button>
        <p className="text-center text-[11px] text-muted-foreground">
          Acesso restrito. Crie o usuário no Firebase Authentication (e-mail/senha).
        </p>
      </form>
    </div>
  );
}
