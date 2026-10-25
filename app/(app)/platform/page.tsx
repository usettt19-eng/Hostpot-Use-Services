import { createAdminClient } from "@/lib/supabase";
import { setTenantModule, setTenantSuspended } from "@/app/platform-actions";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { summarizeTenants } from "@/lib/platform";
import NewTenantForm from "./new-tenant-form";
import { mailConfigured } from "@/lib/mail";

export const dynamic = "force-dynamic";
const LIMIT = 20_000;
const TYPES: Record<string, string> = { school: "Escuela", restaurant: "Restaurante", pub: "Pub", hotel: "Hotel" };

export default async function PlatformPage() {
  await requirePlatformAdmin();
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [t, p, g, s, sp, r, tm] = await Promise.all([
    db.from("tenants").select("id, name, slug, type, created_at").order("created_at", { ascending: false }).limit(1000),
    db.from("profiles").select("tenant_id, status").limit(LIMIT),
    db.from("guests").select("tenant_id").limit(LIMIT),
    db.from("guest_sessions").select("tenant_id, status, started_at").gte("started_at", since).limit(LIMIT),
    db.from("tenant_suspensions").select("tenant_id, suspended_at, reason"),
    db.from("tenant_router_credentials").select("tenant_id, router_url"),
    db.from("tenant_modules").select("tenant_id, module"), // si la migración 0015 falta, viene vacío
  ]);
  const modulesOf = new Map<string, Set<string>>();
  for (const m of tm.data ?? []) modulesOf.set(m.tenant_id, (modulesOf.get(m.tenant_id) ?? new Set()).add(m.module));
  const routers = new Set((r.data ?? []).filter((x) => x.router_url).map((x) => x.tenant_id));
  const rows = summarizeTenants(t.data ?? [], p.data ?? [], g.data ?? [], s.data ?? [], sp.data ?? [], routers, new Date());
  const truncated = [p, g, s].some((q) => (q.data?.length ?? 0) >= LIMIT);
  const suspended = rows.filter((x) => x.suspended).length;

  return (
    <>
      <div className="card">
        <h1>Plataforma</h1>
        <p className="muted">Todos los establecimientos. Suspender uno corta el WiFi de sus usuarios y de sus visitantes, y bloquea su panel hasta que lo reactives.</p>
        <div className="row">
          <span className="badge">Establecimientos: {rows.length}</span>
          <span className="badge">Suspendidos: {suspended}</span>
          <span className={`badge ${mailConfigured() ? "active" : "pending"}`} title="SMTP_URL y MAIL_FROM en el .env del servidor">
            Correo de envío: {mailConfigured() ? "configurado" : "sin configurar"}
          </span>
        </div>
        {truncated && <p className="err">Hay muchos registros: las cifras pueden estar incompletas.</p>}
      </div>
      <NewTenantForm />
      <div className="card scroll">
        <table className="table">
          <thead><tr><th>Establecimiento</th><th>Tipo</th><th>Usuarios</th><th>Pendientes</th><th>Visitantes</th><th>Conexiones (30 d)</th><th>Router</th><th>Módulos</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="muted">Todavía no hay establecimientos.</td></tr>}
            {rows.map((x) => (
              <tr key={x.id}>
                <td><strong>{x.name}</strong><br /><span className="muted">{x.slug}</span></td>
                <td>{TYPES[x.type] ?? x.type}</td>
                <td>{x.users}</td><td>{x.pending}</td><td>{x.guests}</td><td>{x.connections30}</td>
                <td>{x.routerConfigured ? "Configurado" : "Sin configurar"}</td>
                <td>
                  {MODULE_KEYS.map((k) => {
                    const on = modulesOf.get(x.id)?.has(k) ?? false;
                    return (
                      <form key={k} action={setTenantModule} className="inline" title={MODULES[k].description}>
                        <input type="hidden" name="id" value={x.id} />
                        <input type="hidden" name="module" value={k} />
                        <input type="hidden" name="enabled" value={on ? "0" : "1"} />
                        <span className={`badge ${on ? "active" : ""}`}>{MODULES[k].label}: {on ? "activo" : "apagado"}</span>{" "}
                        <button className="ghost">{on ? "Desactivar" : "Activar"}</button>
                      </form>
                    );
                  })}
                </td>
                <td>
                  {x.suspended
                    ? <><span className="badge suspended">Suspendido</span><br /><span className="muted">{x.reason ?? ""}</span></>
                    : <span className="badge active">Activo</span>}
                </td>
                <td>
                  <form action={setTenantSuspended} className="inline">
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="suspend" value={x.suspended ? "0" : "1"} />
                    {!x.suspended && <input name="reason" placeholder="Motivo (opcional)" maxLength={200} style={{ width: 160 }} />}
                    <button className={x.suspended ? "ghost" : "danger"}>{x.suspended ? "Reactivar" : "Suspender"}</button>
                  </form>
                  <p><a href={`/platform/router/${x.id}`}>Configurar router</a></p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
