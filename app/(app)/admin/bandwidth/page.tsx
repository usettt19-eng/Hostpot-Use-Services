import { redirect } from "next/navigation";
import { createClient, getRouterConfig } from "@/lib/supabase";
import { saveBandwidth } from "@/app/actions";
import { isConfigured } from "@/lib/mikrotik";
import { ROLE_LABEL, isAdminRole } from "@/lib/roles";

export default async function BandwidthPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role, status, tenant_id").eq("id", auth.user!.id).single();
  if (!me || me.status !== "active" || !isAdminRole(me.role)) redirect("/dashboard");

  const { data: profiles } = await supabase
    .from("bandwidth_profiles").select("id, role, name, download_kbps, upload_kbps, max_devices").order("download_kbps", { ascending: false });
  const tenant = await getRouterConfig(me.tenant_id);

  return (
    <>
      <div className="card">
        <h1>Ancho de banda por rol</h1>
        <p className="muted">Se aplica como límite de velocidad en el perfil de usuario del Hotspot de MikroTik (en kbps). «Dispositivos» es cuántos equipos puede usar a la vez cada usuario de ese rol; cada dispositivo recibe la velocidad completa.</p>
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Rol</th><th>Bajada (kbps)</th><th>Subida (kbps)</th><th>Dispositivos</th><th /></tr></thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id}>
                  <td><b>{ROLE_LABEL[p.role]}</b></td>
                  <td>
                    <input form={`bw-${p.id}`} className="num" name="download_kbps" type="number" min={64} defaultValue={p.download_kbps} aria-label={`Bajada de ${ROLE_LABEL[p.role]} en kbps`} />
                    <div className="unit">{(p.download_kbps / 1024).toFixed(1)} Mbps</div>
                  </td>
                  <td>
                    <input form={`bw-${p.id}`} className="num" name="upload_kbps" type="number" min={64} defaultValue={p.upload_kbps} aria-label={`Subida de ${ROLE_LABEL[p.role]} en kbps`} />
                    <div className="unit">{(p.upload_kbps / 1024).toFixed(1)} Mbps</div>
                  </td>
                  <td>
                    <input form={`bw-${p.id}`} className="num" style={{ width: 80 }} name="max_devices" type="number" min={1} max={10} defaultValue={p.max_devices} aria-label={`Dispositivos de ${ROLE_LABEL[p.role]}`} />
                    <div className="unit">a la vez</div>
                  </td>
                  <td>
                    <form id={`bw-${p.id}`} action={saveBandwidth}><input type="hidden" name="id" value={p.id} /></form>
                    <button form={`bw-${p.id}`}>Aplicar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Conexión al router</h2>
        {isConfigured(tenant)
          ? <p>Conectado a <code>{tenant.router_url}</code> con el usuario <code>{tenant.router_user}</code>.</p>
          : <p>El router de este establecimiento todavía no está configurado: el portal funciona en modo simulado.</p>}
        <p className="muted">La conexión con el router la configura el administrador de la plataforma. Si necesitas cambiarla, contáctalo.</p>
      </div>
    </>
  );
}
