import { redirect } from "next/navigation";
import { createClient, getRouterConfig } from "@/lib/supabase";
import { fetchUsage, formatBytes } from "@/lib/mikrotik";
import { ROLE_LABEL, isAdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role, status, tenant_id").eq("id", auth.user!.id).single();
  if (!me || me.status !== "active" || !isAdminRole(me.role)) redirect("/dashboard");

  const tenant = await getRouterConfig(me.tenant_id);
  const { data: users } = await supabase
    .from("hotspot_users").select("username, profiles(full_name, role)");

  let error: string | null = null;
  let usage: Awaited<ReturnType<typeof fetchUsage>> = { simulated: true, rows: [] };
  try {
    usage = await fetchUsage(tenant, (users ?? []).map((u) => u.username));
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo consultar el router";
    usage = { simulated: false, rows: [] };
  }

  const info = new Map(
    (users ?? []).map((u) => [u.username, u.profiles as unknown as { full_name: string; role: string }])
  );
  const rows = usage.rows
    .map((r) => ({ ...r, total: r.bytesIn + r.bytesOut, person: info.get(r.name) }))
    .sort((a, b) => b.total - a.total);
  const max = rows[0]?.total || 1;

  const byRole = new Map<string, number>();
  rows.forEach((r) => byRole.set(r.person?.role ?? "?", (byRole.get(r.person?.role ?? "?") ?? 0) + r.total));

  return (
    <>
      <div className="card">
        <h1>Consumo</h1>
        {usage.simulated && <p className="muted">Modo simulado: el router de este establecimiento todavía no está configurado. Pide al administrador de la plataforma que lo conecte.</p>}
        {error && <p className="err">{error}</p>}
        <div className="row">
          {[...byRole.entries()].map(([role, total]) => (
            <span key={role} className="badge">{ROLE_LABEL[role] ?? role}: {formatBytes(total)}</span>
          ))}
        </div>
      </div>
      <div className="card scroll">
        <table className="table">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Descarga</th><th>Subida</th><th style={{ width: "25%" }}>Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.person?.full_name ?? r.name}</td>
                <td>{r.person ? ROLE_LABEL[r.person.role] : "—"}</td>
                <td>{formatBytes(r.bytesIn)}</td>
                <td>{formatBytes(r.bytesOut)}</td>
                <td><div className="bar"><i style={{ width: `${(r.total / max) * 100}%` }} /></div> {formatBytes(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
