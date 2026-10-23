import { createClient, getRouterConfig } from "@/lib/supabase";
import { requireAdminTenant } from "@/lib/portal";
import { isConfigured, listActiveDetails, formatBytes, type RouterConfig } from "@/lib/mikrotik";
import { classify, counts, type Active, type PortalUser } from "@/lib/connected";
import { ROLE_LABEL } from "@/lib/roles";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, string> = { all: "Todos", user: "Usuarios", guest: "Visitantes" };

export default async function ConnectedPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter = f && FILTERS[f] ? f : "all";
  const ctx = await requireAdminTenant();
  const router: RouterConfig = await getRouterConfig(ctx.tenantId);

  let active: Active[] = [];
  let problem: string | null = null;
  if (!isConfigured(router)) {
    problem = "El router de este establecimiento todavía no está configurado, así que no hay sesiones que mostrar.";
  } else {
    try {
      active = await listActiveDetails(router);
    } catch (e) {
      console.error("connected:", e instanceof Error ? e.message : "error");
      problem = "No se pudo consultar el router. Revisa que esté encendido y que el túnel esté activo.";
    }
  }

  const supabase = await createClient();
  const { data: hu } = await supabase.from("hotspot_users").select("username, profiles(full_name, role)");
  const users = new Map<string, PortalUser>();
  for (const r of hu ?? []) {
    const p = r.profiles as unknown as { full_name: string; role: string } | null;
    if (p) users.set(r.username.toLowerCase(), { name: p.full_name, role: p.role });
  }

  const all = classify(active, users);
  const c = counts(all);
  const rows = filter === "all" ? all : all.filter((r) => r.kind === filter);

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="card">
        <h1>Conectados ahora</h1>
        <p className="muted">Sesiones abiertas en el Hotspot en este momento. La página se actualiza sola cada 30 segundos.</p>
        {problem && <p className="err">{problem}</p>}
        <div className="row">
          <span className="badge">Personas con usuario: {c.users}</span>
          <span className="badge">Dispositivos de usuarios: {c.userDevices}</span>
          <span className="badge">Visitantes: {c.guests}</span>
          {c.other > 0 && <span className="badge">Solo en el router: {c.other}</span>}
          <span className="badge">Dispositivos en total: {c.devices}</span>
        </div>
        <p className="row ranges">
          {Object.entries(FILTERS).map(([k, label]) => (
            <a key={k} href={`/admin/connected?f=${k}`} className={k === filter ? "on" : ""} aria-current={k === filter ? "page" : undefined}>{label}</a>
          ))}
        </p>
      </div>
      <div className="card scroll">
        <table className="table">
          <thead><tr><th>Quién</th><th>Rol</th><th>Usuario</th><th>IP</th><th>MAC</th><th>Conectado hace</th><th>Datos</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No hay nadie conectado en esta vista.</td></tr>}
            {rows.map((r, i) => (
              <tr key={`${r.user}-${r.address}-${i}`}>
                <td>{r.kind === "user" ? r.name : r.kind === "guest" ? "Visitante" : "—"}</td>
                <td>{r.role ? ROLE_LABEL[r.role] ?? r.role : r.kind === "guest" ? "Visitante" : "Sin portal"}</td>
                <td>{r.user}</td><td>{r.address}</td><td>{r.mac}</td><td>{r.uptime || "—"}</td><td>{formatBytes(r.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">«Datos» es el total de la sesión (subida y bajada juntas). «Solo en el router» son usuarios creados directamente en el router que el portal no conoce.</p>
      </div>
    </>
  );
}
