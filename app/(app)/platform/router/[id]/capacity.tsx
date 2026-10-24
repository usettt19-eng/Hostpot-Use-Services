"use client";

import { useActionState } from "react";
import { saveCapacity } from "@/app/router-actions";

type Props = { tenantId: string; downMbps: number | null; upMbps: number | null; network: string; mode: "roles" | "equal"; connected: boolean };

export default function CapacityForm({ tenantId, downMbps, upMbps, network, mode, connected }: Props) {
  const [state, action, pending] = useActionState(saveCapacity, null);
  return (
    <form action={action}>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div>
          <label htmlFor="cap-down">Internet contratado: bajada (Mbps)</label>
          <input id="cap-down" name="down_mbps" inputMode="decimal" required defaultValue={downMbps ?? ""} placeholder="Ej. 50" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="cap-up">Internet contratado: subida (Mbps)</label>
          <input id="cap-up" name="up_mbps" inputMode="decimal" required defaultValue={upMbps ?? ""} placeholder="Ej. 50" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="cap-net">Red del WiFi</label>
          <input id="cap-net" name="network" required defaultValue={network} placeholder="192.168.200.0/24" autoComplete="off" />
        </div>
      </div>
      <label htmlFor="cap-mode">Cómo se reparte</label>
      <select id="cap-mode" name="mode" defaultValue={mode}>
        <option value="roles">Por rol: cada rol con su velocidad, su mínimo garantizado y su ráfaga (recomendado)</option>
        <option value="equal">Equitativo: todos por igual entre quienes estén usando la red (PCQ), sin velocidades por rol</option>
      </select>
      {!connected && <p className="err">Primero guarda la conexión con el router (abajo): sin ella no se puede aplicar.</p>}
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.warn && <p className="err" role="status">{state.warn}</p>}
      {state?.ok && <p className="okmsg" role="status">{state.ok}</p>}
      <p><button disabled={pending}>{pending ? "Aplicando…" : "Guardar y aplicar en el router"}</button></p>
    </form>
  );
}
