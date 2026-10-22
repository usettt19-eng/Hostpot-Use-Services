"use client";

import { useActionState } from "react";
import { addFixedDevice, type FixedState } from "@/app/fixed-device-actions";

export function FixedDeviceForm() {
  const [state, action, pending] = useActionState<FixedState, FormData>(addFixedDevice, null);
  return (
    <form action={action} className="card">
      <h2>Registrar equipo fijo</h2>
      <p className="muted">Para impresoras, pantallas o equipos de control. No pasan por el login del Hotspot.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div><label>MAC</label><input name="mac" placeholder="AA:BB:CC:DD:EE:FF" required autoComplete="off" /></div>
        <div><label>Nombre</label><input name="name" required maxLength={80} autoComplete="off" /></div>
        <div><label>IP fija (opcional)</label><input name="ip" placeholder="192.168.200.201" autoComplete="off" /></div>
        <div><label>Ubicación</label><input name="location" maxLength={80} autoComplete="off" /></div>
      </div>
      <label>Motivo</label>
      <input name="reason" maxLength={200} autoComplete="off" />
      <p><button disabled={pending}>{pending ? "Registrando…" : "Registrar"}</button></p>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
    </form>
  );
}
