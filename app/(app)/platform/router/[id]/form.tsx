"use client";

import { useActionState, useState } from "react";
import { generateRouterScript } from "@/app/router-actions";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function RouterSetupForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(generateRouterScript, null);
  const [wg, setWg] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (i: number, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { /* el texto se puede seleccionar a mano */ }
  };
  return (
    <>
      <form action={action}>
        <input type="hidden" name="tenant_id" value={tenantId} />
        <label>Puerto del router para el WiFi de visitantes</label>
        <input name="iface" defaultValue="ether3" required maxLength={30} />
        <label>Red de los visitantes (privada, termina en .0/24)</label>
        <input name="network" defaultValue="192.168.200.0/24" required maxLength={20} />
        <label>Contraseña del usuario «portal» del router (opcional: si la dejas vacía se genera una)</label>
        <input name="rest_password" type="text" autoComplete="off" maxLength={64} placeholder="12 a 64 letras, números, . - _" />
        <label className="inline"><input type="checkbox" name="use_wg" checked={wg} onChange={(e) => setWg(e.target.checked)} style={{ width: "auto" }} /> El router se conecta al portal por un túnel WireGuard</label>
        {wg && (
          <>
            <label>Clave pública del servidor WireGuard</label>
            <input name="wg_key" required maxLength={44} autoComplete="off" />
            <label>Destino del túnel (host:puerto)</label>
            <input name="wg_endpoint" required placeholder="connect.useservices.company:51820" />
            <label>IP del router en el túnel</label>
            <input name="wg_router" required placeholder="10.99.0.3/24" />
            <label>IP del servidor en el túnel</label>
            <input name="wg_server" required defaultValue="10.99.0.1" />
          </>
        )}
        {state?.error && <p className="err">{state.error}</p>}
        <p><button disabled={pending}>{pending ? "Generando…" : "Generar instrucciones"}</button></p>
      </form>

      {state?.blocks && state.rsc && (
        <>
          <div className="card">
            <p className="okmsg">Listo. Contraseña del usuario «portal»: <strong>{state.password}</strong></p>
            <p className="muted">
              {state.generated ? "Se generó para ti. " : ""}Guárdala ahora: no se vuelve a mostrar. Después, en <strong>Conexión del portal con el router</strong> (abajo en esta pantalla),
              escribe el usuario <strong>portal</strong>, esta contraseña y la huella del certificado que verás al ejecutar el bloque 2.
            </p>
            <p><button onClick={() => download(state.filename!, state.rsc!)}>Descargar archivo .rsc</button></p>
            <p className="muted">Para usar el archivo: súbelo al router (WinBox → Files) y ejecuta <code>/import file-name={state.filename}</code>. Si un comando falla, la importación se detiene en ese punto: revisa el error antes de repetirla.</p>
          </div>
          {state.blocks.map((b, i) => (
            <div className="card scroll" key={i}>
              <h2>{b.title}</h2>
              <p className="muted">{b.text}</p>
              {b.warn && <p className="err">⚠️ {b.warn}</p>}
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--bg)", padding: 12, borderRadius: 8 }}>{b.commands}</pre>
              <button className="ghost" onClick={() => copy(i, b.commands)}>{copied === i ? "Copiado" : "Copiar bloque"}</button>
            </div>
          ))}
        </>
      )}
    </>
  );
}
