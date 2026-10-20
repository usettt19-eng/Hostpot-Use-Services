"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerSchool } from "@/app/actions";

export default function RegisterSchoolPage() {
  const [state, action, pending] = useActionState(registerSchool, null);
  return (
    <div className="auth">
      <div className="card">
        <h1>Crear escuela</h1>
        <form action={action}>
          <label>Nombre de la escuela</label>
          <input name="school_name" required />
          <label>Tu nombre completo (administrador)</label>
          <input name="full_name" required />
          <label>Correo</label>
          <input name="email" type="email" required />
          <label>Contraseña (mín. 8)</label>
          <input name="password" type="password" minLength={8} required />
          {state && "error" in state && <p className="err">{state.error}</p>}
          {state && "ok" in state && <p className="okmsg">{state.ok}</p>}
          <p><button disabled={pending}>{pending ? "Creando…" : "Crear escuela"}</button></p>
        </form>
        <p className="muted"><Link href="/login">Volver a entrar</Link></p>
      </div>
    </div>
  );
}
