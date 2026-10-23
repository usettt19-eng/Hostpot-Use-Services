"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions";
import AuthLogo from "@/components/AuthLogo";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div className="auth">
      <div className="card">
        <AuthLogo />
        <h1 className="sr-only">Entrar al panel</h1>
        <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>Entra a tu panel.</p>
        <form action={action}>
          <label>Correo</label>
          <input name="email" type="email" required autoComplete="email" />
          <label>Contraseña</label>
          <input name="password" type="password" required autoComplete="current-password" />
          {state?.error && <p className="err">{state.error}</p>}
          <p><button disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button></p>
        </form>
        <p className="muted">
          <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link> · <Link href="/register">Registrarme en mi establecimiento</Link>
        </p>
      </div>
    </div>
  );
}
