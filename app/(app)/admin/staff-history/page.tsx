import { createClient } from "@/lib/supabase";
import { requireAdminTenant } from "@/lib/portal";
import { syncStaffSessions } from "@/lib/staff-history";
import { RETENTION_DAYS, formatDuration, summarizeHistory } from "@/lib/staff-sync";
import { formatBytes } from "@/lib/mikrotik";
import { ROLE_LABEL } from "@/lib/roles";

export const dynamic = "force-dynamic";

const RANGES: Record<string, string> = { "7": "7 días", "30": "30 días", "90": "90 días" };
const LIMIT = 5000;
const TZ = "America/Panama";
const when = (d: string | null) => (d ? new Date(d).toLocaleString("es", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—");

export default async function StaffHistoryPage({ searchParams }: { searchParams: Promise<{ range?: string; p?: string }> }) {
  const { range, p } = await searchParams;
  const days = Number(range && RANGES[range] ? range : "30");
  const ctx = await requireAdminTenant();
  const sync = await syncStaffSessions(ctx.tenantId); // pone al día con el router al abrir
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from("staff_sessions").select("id, profile_id, username, ip, mac_hash, started_at, last_seen_at, ended_at, bytes")
      .gte("last_seen_at", since).order("started_at", { ascending: false }).limit(LIMIT),
    supabase.from("profiles").select("id, full_name, role"),
  ]);
  const all = rows ?? [];
  const info = new Map((people ?? []).map((x) => [x.id as string, x]));
  const summary = summarizeHistory(all);
  const selected = p && info.has(p) ? p : null;
  const detail = selected ? all.filter((r) => r.profile_id === selected) : all.slice(0, 100);
  const q = (r: string, pp?: string | null) => `/admin/staff-history?range=${r}${pp ? `&p=${pp}` : ""}`;

  return (
    <>
      <div className="card">
        <h1>Historial de conexiones</h1>
        <p className="muted">
          Cuándo se conectó cada usuario del portal (personal, docentes, alumnos con cuenta…) y con cuántos dispositivos. Se guarda {RETENTION_DAYS} días;
          los dispositivos se identifican con un código, no con su MAC. Solo lo ven los administradores. Informa al personal en los términos de uso.
        </p>
        {sync.error && <p className="err">{sync.error}: el historial puede estar desactualizado.</p>}
        <div className="row ranges">
          {Object.entries(RANGES).map(([k, label]) => (
            <a key={k} href={q(k, selected)} className={String(days) === k ? "on" : ""} aria-current={String(days) === k ? "page" : undefined}>{label}</a>
          ))}
        </div>
        {all.length >= LIMIT && <p className="err">Hay más de {LIMIT} sesiones: se muestran las más recientes.</p>}
      </div>

      <div className="card scroll">
        <h2>Por persona</h2>
        <table className="table">
          <thead><tr><th>Persona</th><th>Rol</th><th>Sesiones</th><th>Dispositivos</th><th>Días con conexión</th><th>Tiempo total</th><th>Último acceso</th><th /></tr></thead>
          <tbody>
            {summary.length === 0 && <tr><td colSpan={8} className="muted">Todavía no hay conexiones registradas en este periodo.</td></tr>}
            {summary.map((s) => {
              const i = info.get(s.profileId);
              return (
                <tr key={s.profileId}>
                  <td>{i?.full_name ?? "(cuenta eliminada)"}{s.online && <> <span className="badge active">En línea</span></>}</td>
                  <td>{i ? ROLE_LABEL[i.role] ?? i.role : "—"}</td>
                  <td>{s.sessions}</td><td>{s.devices}</td><td>{s.days}</td><td>{formatDuration(s.totalMs)}</td><td>{when(s.lastSeen)}</td>
                  <td><a href={q(String(days), s.profileId)}>Ver sesiones</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">«Tiempo total» suma todos los dispositivos: dos dispositivos conectados una hora cuentan dos horas.</p>
      </div>

      <div className="card scroll">
        <h2>{selected ? `Sesiones de ${info.get(selected)?.full_name ?? "la persona"}` : "Últimas sesiones"}</h2>
        {selected && <p><a href={q(String(days))}>← Ver todas</a></p>}
        <table className="table">
          <thead><tr><th>Persona</th><th>Usuario</th><th>IP</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Datos</th></tr></thead>
          <tbody>
            {detail.length === 0 && <tr><td colSpan={7} className="muted">Sin sesiones.</td></tr>}
            {detail.map((r) => {
              const end = r.ended_at ?? r.last_seen_at;
              return (
                <tr key={r.id}>
                  <td>{info.get(r.profile_id)?.full_name ?? "—"}</td><td>{r.username}</td><td>{r.ip ?? "—"}</td>
                  <td>{when(r.started_at)}</td><td>{r.ended_at ? when(r.ended_at) : "En curso"}</td>
                  <td>{formatDuration(Date.parse(end) - Date.parse(r.started_at))}</td><td>{formatBytes(Number(r.bytes))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
