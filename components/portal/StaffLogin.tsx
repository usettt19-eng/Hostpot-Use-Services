"use client";

import { useState } from "react";
import { buildLoginRedirect } from "@/lib/guest-utils";

type Props = {
  loginUrl: string; // ya validada en el servidor: http(s)://<IP privada>/login
  dst: string;
  slug: string;
  t: { staff: string; staffUser: string; staffPass: string; staffButton: string; staffHelp: string; register: string };
};

/** Acceso del personal con usuario y contraseña del Hotspot: el navegador va directo al login del router. */
export default function StaffLogin({ loginUrl, dst, slug, t }: Props) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  return (
    <details className="pv-staff">
      <summary>{t.staff}</summary>
      <form onSubmit={(e) => { e.preventDefault(); window.location.assign(buildLoginRedirect(loginUrl, u, p, dst)); }}>
        <label>{t.staffUser}</label>
        <input type="text" value={u} onChange={(e) => setU(e.target.value)} required autoComplete="username" maxLength={100} />
        <label>{t.staffPass}</label>
        <input type="password" value={p} onChange={(e) => setP(e.target.value)} required autoComplete="current-password" maxLength={200} />
        <button className="pv-btn" type="submit">{t.staffButton}</button>
      </form>
      <p className="pv-sub" style={{ marginTop: 10 }}>
        {t.staffHelp} <a href={`/register?school=${encodeURIComponent(slug)}`}>{t.register}</a>
      </p>
    </details>
  );
}
