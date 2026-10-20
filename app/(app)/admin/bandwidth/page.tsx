import { redirect } from "next/navigation";
import { createClient, getRouterConfig } from "@/lib/supabase";
import { saveBandwidth, saveRouter } from "@/app/actions";
import { ROLE_LABEL } from "@/lib/roles";

export default async function BandwidthPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role, status, tenant_id").eq("id", auth.user!.id).single();
  if (!me || me.status !== "active" || !["superadmin", "director"].includes(me.role)) redirect("/dashboard");

  const { data: profiles } = await supabase
    .from("bandwidth_profiles").select("id, role, name, download_kbps, upload_kbps").order("download_kbps", { ascending: false });
  const tenant = await getRouterConfig(me.tenant_id);

  return (
    <>
      <div className="card">
        <h1>Ancho de banda por rol</h1>
        <p className="muted">Se aplica como límite de velocidad en el perfil de usuario del Hotspot de MikroTik (en kbps).</p>
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Rol</th><th>Bajada (kbps)</th><th>Subida (kbps)</th><th /></tr></thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{ROLE_LABEL[p.role]}</td>
                  <td colSpan={3}>
                    <form action={saveBandwidth} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="download_kbps" type="number" min={64} defaultValue={p.download_kbps} />
                      <input name="upload_kbps" type="number" min={64} defaultValue={p.upload_kbps} />
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
        <h2>Conexión al MikroTik (RouterOS v7, REST)</h2>
        <p className="muted">Sin datos de conexión el portal funciona en modo simulado. Habilita el servicio <code>www-ssl</code> en el router y crea un usuario de API con permisos limitados.</p>
        <form action={saveRouter}>
          <label>URL del router (ej. https://192.168.88.1)</label>
          <input name="router_url" defaultValue={tenant.router_url ?? ""} />
          <label>Usuario</label>
          <input name="router_user" defaultValue={tenant.router_user ?? ""} />
          <label>Contraseña (déjala vacía para no cambiarla)</label>
          <input name="router_password" type="password" autoComplete="new-password" />
          <p><button>Guardar conexión</button></p>
        </form>
      </div>
    </>
  );
}
