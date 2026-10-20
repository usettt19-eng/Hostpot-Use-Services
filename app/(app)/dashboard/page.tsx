import { createClient } from "@/lib/supabase";
import { ROLE_LABEL } from "@/lib/roles";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles").select("full_name, role, status").eq("id", auth.user!.id).single();
  const { data: bw } = await supabase
    .from("bandwidth_profiles").select("name, download_kbps, upload_kbps").eq("role", me?.role ?? "").maybeSingle();
  const { data: hu } = await supabase.from("hotspot_users").select("username, disabled").maybeSingle();

  if (me?.status === "pending") {
    return (
      <div className="card">
        <h1>Cuenta pendiente de aprobación</h1>
        <p className="muted">Un administrador de tu establecimiento debe aprobarla para activar tu acceso a la red.</p>
      </div>
    );
  }
  if (me?.status === "suspended") {
    return <div className="card"><h1>Cuenta suspendida</h1><p className="muted">Contacta a un administrador.</p></div>;
  }

  return (
    <div className="card">
      <h1>Hola, {me?.full_name}</h1>
      <p>Rol: <b>{me ? ROLE_LABEL[me.role] : ""}</b></p>
      {bw && (
        <p>Tu plan de red: <b>{bw.name}</b> — {(bw.download_kbps / 1024).toFixed(1)} Mbps bajada / {(bw.upload_kbps / 1024).toFixed(1)} Mbps subida</p>
      )}
      {hu && <p>Usuario de Hotspot: <b>{hu.username}</b> {hu.disabled && <span className="badge suspended">deshabilitado</span>}</p>}
    </div>
  );
}
