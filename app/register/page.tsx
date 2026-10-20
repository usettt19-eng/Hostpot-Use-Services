"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register } from "@/app/actions";
import { ROLES, ROLE_LABEL } from "@/lib/roles";

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, null);
  return (
    <div className="auth">
      <div className="card">
        <h1>Registro de usuario</h1>
        <form action={action}>
          <label>Código de la escuela</label>
          <input name="school" required placeholder="ej. colegio-central" />
          <label>Nombre completo</label>
          <input name="full_name" required />
          <label>Soy…</label>
          <select name="role" defaultValue="student">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <label>Correo</label>
          <input name="email" type="email" required />
          <label>Contraseña (mín. 8)</label>
          <input name="password" type="password" minLength={8} required />
          {state && "error" in state && <p className="err">{state.error}</p>}
          {state && "ok" in state && <p className="okmsg">{state.ok}</p>}
          <p><button disabled={pending}>{pending ? "Creando…" : "Crear cuenta"}</button></p>
        </form>
        <p className="muted"><Link href="/login">Ya tengo cuenta</Link></p>
      </div>
    </div>
  );
}
