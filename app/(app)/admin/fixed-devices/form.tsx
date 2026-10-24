"use client";

import { useActionState } from "react";
import { addFixedDevice, updateFixedDevice, type FixedState } from "@/app/fixed-device-actions";

export function FixedDeviceForm() {
  const [state, action, pending] = useActionState<FixedState, FormData>(addFixedDevice, null);
  return (
    <form action={action} className="card">
      <h2>Registrar equipo fijo</h2>
      <p className="muted">Para impresoras, pantallas o equipos de control. No pasan por el login del Hotspot.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div><label>MAC</label><input name="mac" placeholder="AA:BB:CC:DD:EE:FF" required autoComplete="off" /></div>
        <div><label>Nombre</label><input name="name" required maxLength={80} autoComplete="off" /></div>
        <div><label>IP (opcional)</label><input name="ip" placeholder="192.168.200.201" autoComplete="off" /></div>
        <div><label>Ubicación</label><input name="location" maxLength={80} autoComplete="off" /></div>
      </div>
      <label>Motivo</label>
      <input name="reason" maxLength={200} autoComplete="off" />
      <details className="fold" style={{ marginTop: 12 }}>
        <summary>Límite de velocidad propio (opcional)</summary>
        <div className="foldbody">
          <p className="muted">
            La IP se detecta sola en el router por la MAC; escríbela solo si quieres fijarla. Si no pones nada, el equipo entra al grupo de equipos fijos, que se reparte por igual y nunca deja sin
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

export type EditableDevice = {
  id: string; mac: string; name: string; ip: string | null; location: string | null; reason: string | null;
  max_down_kbps?: number | null; max_up_kbps?: number | null; min_kbps?: number | null;
};
const toMbps = (k?: number | null) => (k ? String(Math.round((k / 1024) * 100) / 100) : "");

export function EditFixedDeviceForm({ device }: { device: EditableDevice }) {
  const [state, action, pending] = useActionState<FixedState, FormData>(updateFixedDevice, null);
  return (
    <form action={action} className="card">
      <h2>Editar «{device.name}»</h2>
      <p className="muted">MAC <code>{device.mac}</code> (no se cambia: para otra MAC, quita el equipo y regístralo de nuevo).</p>
      <input type="hidden" name="id" value={device.id} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div><label>Nombre</label><input name="name" required maxLength={80} defaultValue={device.name} autoComplete="off" /></div>
        <div><label>IP (opcional)</label><input name="ip" defaultValue={device.ip ?? ""} autoComplete="off" /></div>
        <div><label>Ubicación</label><input name="location" maxLength={80} defaultValue={device.location ?? ""} autoComplete="off" /></div>
        <div><label>Motivo</label><input name="reason" maxLength={200} defaultValue={device.reason ?? ""} autoComplete="off" /></div>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Velocidad (la IP se detecta sola por la MAC si no la escribes). Déjala vacía para que entre al grupo que se reparte por igual.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <div><label>Bajada máxima (Mbps)</label><input name="max_down" inputMode="decimal" defaultValue={toMbps(device.max_down_kbps)} autoComplete="off" /></div>
        <div><label>Subida máxima (Mbps)</label><input name="max_up" inputMode="decimal" defaultValue={toMbps(device.max_up_kbps)} autoComplete="off" /></div>
        <div><label>Mínimo garantizado (Mbps)</label><input name="min" inputMode="decimal" defaultValue={toMbps(device.min_kbps)} autoComplete="off" /></div>
      </div>
      <p>
        <button disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button>{" "}
        <a href="/admin/fixed-devices">Volver</a>
      </p>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
    </form>
  );
}
