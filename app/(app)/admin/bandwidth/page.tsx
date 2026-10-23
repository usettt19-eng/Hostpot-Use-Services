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
                  <td>{ROLE_LABEL[p.role]}</td>
                  <td colSpan={4}>
                    <form action={saveBandwidth} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="download_kbps" type="number" min={64} defaultValue={p.download_kbps} />
                      <input name="upload_kbps" type="number" min={64} defaultValue={p.upload_kbps} />
                      <input name="max_devices" type="number" min={1} max={10} defaultValue={p.max_devices} title="Dispositivos a la vez por usuario" />
                      <button>Aplicar</button>
                    </form>
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
