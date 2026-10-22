"use client";

import { useActionState } from "react";
import { createTenant } from "@/app/platform-actions";
import { ESTABLISHMENT_TYPES, ESTABLISHMENT_LABEL } from "@/lib/roles";

export default function NewTenantForm() {
  const [state, action, pending] = useActionState(createTenant, null);
  return (
    <div className="card">
      <h2>Nuevo establecimiento</h2>
      <form action={action}>
        <label>Tipo</label>
        <select name="type" defaultValue="school">
          {ESTABLISHMENT_TYPES.map((t) => <option key={t} value={t}>{ESTABLISHMENT_LABEL[t]}</option>)}
        </select>
        <label>Nombre del establecimiento</label>
        <input name="name" required maxLength={100} />
        <label>Nombre del administrador</label>
        <input name="full_name" required maxLength={100} />
        <label>Correo del administrador</label>
        <input name="email" type="email" required autoComplete="off" />
        {state?.error && <p className="err">{state.error}</p>}
        <p><button disabled={pending}>{pending ? "Creando…" : "Crear establecimiento"}</button></p>
      </form>
      {state?.created && (
        <div className="card">
          <p className="okmsg">Creado: {state.created.name}</p>
          <p>Código del establecimiento: <strong>{state.created.slug}</strong></p>
          <p>Correo: <strong>{state.created.email}</strong><br />Contraseña temporal: <strong>{state.created.password}</strong></p>
          <p className="muted">Guárdala ahora: no se vuelve a mostrar. Pídele al administrador que la cambie al entrar.</p>
        </div>
      )}
    </div>
  );
}
