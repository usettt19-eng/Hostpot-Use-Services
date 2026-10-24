import { redirect } from "next/navigation";
import { createClient, getRouterConfig } from "@/lib/supabase";
import { saveBandwidth } from "@/app/actions";
import { hasSharing, isConfigured } from "@/lib/mikrotik";
import { selectPlans } from "@/lib/plans";
import { guaranteeFit } from "@/lib/queues";
import { ROLE_LABEL, isAdminRole } from "@/lib/roles";

export default async function BandwidthPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role, status, tenant_id").eq("id", auth.user!.id).single();
  if (!me || me.status !== "active" || !isAdminRole(me.role)) redirect("/dashboard");

  const profiles = (await selectPlans((cols) => supabase.from("bandwidth_profiles").select(cols).order("download_kbps", { ascending: false }), "id, role"))
    .sort((a, b) => b.download_kbps - a.download_kbps);
  const tenant = await getRouterConfig(me.tenant_id);
  const sharing = hasSharing(tenant);
  const equal = sharing && tenant.sharing_mode === "equal";
  const mbps = (k: number) => (k / 1024).toLocaleString("es", { maximumFractionDigits: 1 });

  return (
    <>
      <div className="card">
        <h1>Ancho de banda por rol</h1>
        <p className="muted">Se aplica como límite de velocidad en el perfil de usuario del Hotspot de MikroTik (en kbps). «Dispositivos» es cuántos equipos puede usar a la vez cada usuario de ese rol; cada dispositivo recibe la velocidad completa.</p>
        {sharing ? (
          <p className="okmsg">
            Internet contratado: <b>{mbps(tenant.total_down_kbps!)} Mbps</b> de bajada y <b>{mbps(tenant.total_up_kbps!)} Mbps</b> de subida.{" "}
            {equal
              ? "Reparto equitativo: todos comparten por igual y no se aplican velocidades por rol."
              : "El mínimo es lo que siempre se le garantiza a cada persona aunque la red esté llena; el máximo es lo más que puede usar."}
          </p>
        ) : (
          <p className="muted">Todavía no está activado el reparto entre usuarios. El administrador de la plataforma debe indicar cuánto internet contrató tu establecimiento; mientras tanto, cada persona solo tiene su máximo.</p>
        )}
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Rol</th><th>Bajada (kbps)</th><th>Subida (kbps)</th><th>Dispositivos</th>{sharing && !equal && <><th>Mínimo (kbps)</th><th>Ráfaga (kbps)</th></>}<th /></tr></thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id}>
                  <td><b>{ROLE_LABEL[p.role!]}</b></td>
                  <td>
                    <input form={`bw-${p.id}`} className="num" name="download_kbps" type="number" min={64} defaultValue={p.download_kbps} aria-label={`Bajada de ${ROLE_LABEL[p.role!]} en kbps`} />
                    <div className="unit">{(p.download_kbps / 1024).toFixed(1)} Mbps</div>
                  </td>
                  <td>
                    <input form={`bw-${p.id}`} className="num" name="upload_kbps" type="number" min={64} defaultValue={p.upload_kbps} aria-label={`Subida de ${ROLE_LABEL[p.role!]} en kbps`} />
                    <div className="unit">{(p.upload_kbps / 1024).toFixed(1)} Mbps</div>
                  </td>
                  <td>
                    <input form={`bw-${p.id}`} className="num" style={{ width: 80 }} name="max_devices" type="number" min={1} max={10} defaultValue={p.max_devices} aria-label={`Dispositivos de ${ROLE_LABEL[p.role!]}`} />
                    <div className="unit">a la vez</div>
                  </td>
                  {sharing && !equal && (
                    <>
                      <td>
                        <input form={`bw-${p.id}`} className="num" name="min_kbps" type="number" min={0} defaultValue={p.min_kbps ?? 0} aria-label={`Mínimo garantizado de ${ROLE_LABEL[p.role!]} en kbps`} />
                        <div className="unit">{guaranteeFit(tenant.total_down_kbps!, p.min_kbps ?? 0) !== null ? `caben ${guaranteeFit(tenant.total_down_kbps!, p.min_kbps ?? 0)} a la vez` : "sin garantía"}</div>
                      </td>
                      <td>
                        <input form={`bw-${p.id}`} className="num" name="burst_kbps" type="number" min={0} defaultValue={p.burst_kbps ?? 0} aria-label={`Ráfaga de ${ROLE_LABEL[p.role!]} en kbps`} />
                        <div className="unit">0 = sin ráfaga</div>
                      </td>
                    </>
                  )}
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
