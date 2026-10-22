"use client";

import { Suspense, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { register, lookupEstablishment } from "@/app/actions";
import { ROLE_LABEL, ESTABLISHMENT_LABEL, type EstablishmentType } from "@/lib/roles";

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}

function RegisterForm() {
  const initial = (useSearchParams().get("school") ?? "").slice(0, 80); // código precargado desde el portal del local
  const [state, action, pending] = useActionState(register, null);
  const [est, setEst] = useState<{ name: string; type: EstablishmentType; roles: string[] } | null | undefined>(undefined);
  useEffect(() => {
    if (initial) lookupEstablishment(initial).then(setEst);
  }, [initial]);
  return (
    <div className="auth">
      <div className="card">
        <h1>Registro de usuario</h1>
        <form action={action}>
          <label>Código del establecimiento</label>
          <input name="school" required placeholder="ej. colegio-central" defaultValue={initial}
            onBlur={async (e) => setEst(e.target.value ? await lookupEstablishment(e.target.value) : undefined)} />
          {est === null && <p className="err">No existe un establecimiento con ese código</p>}
          {est && <p className="muted">{est.name} · {ESTABLISHMENT_LABEL[est.type]}</p>}
          <label>Nombre completo</label>
          <input name="full_name" required />
          <label>Soy…</label>
          <select name="role" key={est?.type ?? "none"} disabled={!est}>
            {(est?.roles ?? []).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <label>Correo</label>
          <input name="email" type="email" required />
          <label>Contraseña (mín. 8)</label>
          <input name="password" type="password" minLength={8} required />
          {state && "error" in state && <p className="err">{state.error}</p>}
          {state && "ok" in state && <p className="okmsg">{state.ok}</p>}
          <p><button disabled={pending}>{pending ? "Creando…" : "Crear cuenta"}</button></p>
        </form>
        <p className="muted"><Link href="/login">Ya tengo cuenta</Link></p>
      </div>
    </div>
  );
}
