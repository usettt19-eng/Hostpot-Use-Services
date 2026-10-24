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
      <details className="fold" style={{ marginTop: 12 }}>
        <summary>Límite de velocidad propio (opcional)</summary>
        <div className="foldbody">
          <p className="muted">
            Necesita IP fija. Si no pones nada, el equipo entra al grupo de equipos fijos, que se reparte por igual y nunca deja sin
            internet a los demás. Si pones un máximo, tiene su propia cola.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <div><label>Bajada máxima (Mbps)</label><input name="max_down" inputMode="decimal" placeholder="Ej. 4" autoComplete="off" /></div>
            <div><label>Subida máxima (Mbps)</label><input name="max_up" inputMode="decimal" placeholder="Ej. 1" autoComplete="off" /></div>
            <div><label>Mínimo garantizado (Mbps)</label><input name="min" inputMode="decimal" placeholder="Ej. 0.5" autoComplete="off" /></div>
          </div>
        </div>
      </details>
      <p><button disabled={pending}>{pending ? "Registrando…" : "Registrar"}</button></p>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
    </form>
  );
}
