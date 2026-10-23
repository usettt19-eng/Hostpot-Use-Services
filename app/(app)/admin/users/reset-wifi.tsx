"use client";

import { useActionState, useState } from "react";
import { resetWifiPassword } from "@/app/actions";

/** Botón «Nueva clave WiFi»: pide confirmación en la misma fila y muestra la contraseña nueva una sola vez. */
export function ResetWifiForm({ id, username }: { id: string; username: string }) {
  const [state, action, pending] = useActionState(resetWifiPassword, null);
  const [open, setOpen] = useState(false);

  if (state?.password) {
    return (
      <div className="okmsg" role="status">
        Usuario: <code>{state.username}</code> · Contraseña nueva: <code>{state.password}</code>
        <br />Cópiala ahora: no se vuelve a mostrar. Si estaba conectado, se le cerró la sesión.
      </div>
    );
  }
  if (!open) return <button type="button" className="ghost" onClick={() => setOpen(true)}>Nueva clave WiFi</button>;
  return (
    <form action={action} className="inline" aria-label={`Nueva contraseña de WiFi para ${username}`}>
      <input type="hidden" name="id" value={id} />
      <input name="password" placeholder="Se genera si la dejas vacía" autoComplete="off" maxLength={64} style={{ width: 210 }} aria-label="Contraseña nueva (opcional)" />
      <button disabled={pending}>{pending ? "Cambiando…" : "Cambiar"}</button>
      <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancelar</button>
      {state?.error && <span className="err" role="alert">{state.error}</span>}
    </form>
  );
}
