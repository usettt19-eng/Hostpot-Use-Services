"use client";

import { useActionState } from "react";
import { approveUser } from "@/app/actions";
import { ROLE_LABEL } from "@/lib/roles";

export function ApproveForm({ id, requestedRole, roles }: { id: string; requestedRole: string; roles: readonly string[] }) {
  const [state, action, pending] = useActionState(approveUser, null);
  if (state?.password) {
    return (
      <div className="okmsg">
        Usuario: <code>{state.username}</code> · Contraseña: <code>{state.password}</code>
        <br />Cópiala ahora: no se vuelve a mostrar.
      </div>
    );
  }
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <select name="role" defaultValue={requestedRole} style={{ width: "auto" }}>
        {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <input name="hotspot_password" placeholder="Contraseña WiFi (opcional)" autoComplete="off" style={{ width: "auto" }} />
      <button disabled={pending}>{pending ? "Aprobando…" : "Aprobar"}</button>
      {state?.error && <span className="err">{state.error}</span>}
    </form>
  );
}
