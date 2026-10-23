"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions";
import { SITE } from "@/lib/site";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div className="auth">
      <div className="card">
        <h1>{SITE.name}</h1>
        <p className="muted">Entra a tu panel.</p>
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
