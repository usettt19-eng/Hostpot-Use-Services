"use client";

import { useActionState } from "react";
import { saveTenantRouter } from "@/app/router-actions";

type Props = { tenantId: string; url: string; user: string; fingerprint: string; hasPassword: boolean };

export default function ConnectionForm({ tenantId, url, user, fingerprint, hasPassword }: Props) {
  const [state, action, pending] = useActionState(saveTenantRouter, null);
  return (
    <form action={action}>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <label>URL del router (por el túnel)</label>
      <input name="router_url" defaultValue={url} required placeholder="https://10.99.0.3" autoComplete="off" />
      <label>Usuario</label>
      <input name="router_user" defaultValue={user || "portal"} required autoComplete="off" />
      <label>Contraseña {hasPassword ? "(déjala vacía para conservar la guardada)" : ""}</label>
      <input name="router_password" type="password" autoComplete="new-password" />
      <label>Huella SHA-256 del certificado (la del bloque 2 de la configuración)</label>
      <input name="router_cert_fingerprint" defaultValue={fingerprint} autoComplete="off" placeholder="64 caracteres hexadecimales" />
      {state?.error && <p className="err">{state.error}</p>}
      {state?.warn && <p className="err">{state.warn}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
      <p><button disabled={pending}>{pending ? "Probando…" : "Guardar y probar"}</button></p>
    </form>
  );
}
