"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div className="auth">
      <div className="card">
        <h1>Portal de Red Escolar</h1>
        <form action={action}>
          <label>Correo</label>
          <input name="email" type="email" required autoComplete="email" />
          <label>Contraseña</label>
          <input name="password" type="password" required autoComplete="current-password" />
          {state?.error && <p className="err">{state.error}</p>}
          <p><button disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button></p>
        </form>
        <p className="muted">
          <Link href="/register">Registrarme en mi escuela</Link> · <Link href="/register-school">Crear una escuela</Link>
        </p>
      </div>
    </div>
  );
}
