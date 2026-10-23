"use client";

import { useActionState } from "react";
import { createUser } from "@/app/actions";
import { ROLE_LABEL } from "@/lib/roles";

export function CreateUserForm({ roles }: { roles: readonly string[] }) {
  const [state, action, pending] = useActionState(createUser, null);
  return (
    <form action={action} className="card">
      <p className="muted">La cuenta queda activa y con acceso al WiFi. Las credenciales se muestran una sola vez.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div><label>Nombre completo</label><input name="full_name" required maxLength={100} autoComplete="off" /></div>
        <div><label>Correo</label><input name="email" type="email" required autoComplete="off" /></div>
        <div><label>Rol</label>
          <select name="role" defaultValue={roles[0]}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div><label>Contraseña del WiFi (opcional)</label><input name="hotspot_password" autoComplete="off" placeholder="Se genera si la dejas vacía" /></div>
      </div>
      <p><button disabled={pending}>{pending ? "Creando…" : "Crear usuario"}</button></p>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.username && (
        <div className="okmsg">
          Usuario creado: <b>{state.name}</b><br />
          Usuario del WiFi: <code>{state.username}</code> · Contraseña: <code>{state.password}</code><br />
          Cópialas ahora: no se vuelven a mostrar.
        </div>
      )}
    </form>
  );
}
