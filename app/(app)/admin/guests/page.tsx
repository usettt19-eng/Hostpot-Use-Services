import { createClient } from "@/lib/supabase";
import { decryptSecret } from "@/lib/crypto";
import { requireAdminTenant } from "@/lib/portal";
import { syncGuestSessions } from "@/lib/guest-sync";
import { formatBytes } from "@/lib/mikrotik";
import { deleteGuest } from "@/app/guest-actions";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function GuestsPage() {
  const ctx = await requireAdminTenant();
  const sync = await syncGuestSessions(ctx.tenantId); // pone al día las sesiones con el router
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * DAY).toISOString();

  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [total, recurrent, newWeek, sessionsWeek, activeNow] = await Promise.all([
    count(supabase.from("guests").select("id", { count: "exact", head: true })),
    count(supabase.from("guests").select("id", { count: "exact", head: true }).gt("visit_count", 1)),
    count(supabase.from("guests").select("id", { count: "exact", head: true }).gte("first_seen_at", since)),
    count(supabase.from("guest_sessions").select("id", { count: "exact", head: true }).gte("started_at", since)),
    count(supabase.from("guest_sessions").select("id", { count: "exact", head: true }).eq("status", "active")),
  ]);

  const { data: guests } = await supabase
    .from("guests").select("id, email_enc, full_name, visit_count, first_seen_at, last_seen_at")
    .order("last_seen_at", { ascending: false }).limit(50);
  const ids = (guests ?? []).map((g) => g.id);
  const { data: consents } = ids.length
    ? await supabase.from("guest_consents").select("guest_id, granted, created_at")
        .eq("kind", "marketing").in("guest_id", ids).order("created_at", { ascending: false })
    : { data: [] };
  // Correo verificado: consulta aparte para que la pantalla siga funcionando si la migración 0017 aún no está aplicada
  const verifiedIds = new Set<string>();
  if (ids.length) {
    const ver = await supabase.from("guests").select("id, email_verified_at").in("id", ids).not("email_verified_at", "is", null);
    for (const r of ver.data ?? []) verifiedIds.add(r.id);
  }
  const marketing = new Map<string, boolean>();
  for (const c of consents ?? []) if (!marketing.has(c.guest_id)) marketing.set(c.guest_id, c.granted); // el más reciente

  const { data: sessions } = await supabase
    .from("guest_sessions").select("id, status, started_at, ended_at, bytes_in, bytes_out, method")
    .order("started_at", { ascending: false }).limit(15);

  const safeEmail = (enc: string) => { try { return decryptSecret(enc); } catch { return "(no se pudo descifrar)"; } };
  const when = (d: string | null) => (d ? new Date(d).toLocaleString("es") : "—");
  const STATUS: Record<string, string> = { pending: "Pendiente", active: "Conectado", ended: "Terminada", failed: "Fallida" };

  return (
    <>
      <div className="card">
        <h1>Visitantes</h1>
        <p className="muted">Personas que se conectaron por el portal del establecimiento. Los datos están cifrados y solo los ven los administradores.</p>
        {sync.error && <p className="err">{sync.error}: las sesiones pueden estar desactualizadas.</p>}
        <div className="row">
          <span className="badge">Visitantes: {total}</span>
          <span className="badge">Recurrentes: {recurrent}</span>
          <span className="badge">Nuevos (7 días): {newWeek}</span>
          <span className="badge">Sesiones (7 días): {sessionsWeek}</span>
          <span className="badge">Conectados ahora: {activeNow}</span>
        </div>
        <p><a href="/admin/guests/export">Descargar CSV</a></p>
      </div>

      <div className="card scroll">
        <h2>Últimos visitantes</h2>
        <table className="table">
          <thead><tr><th>Correo</th><th>Verificado</th><th>Nombre</th><th>Visitas</th><th>Primera</th><th>Última</th><th>Promociones</th><th /></tr></thead>
          <tbody>
            {(guests ?? []).length === 0 && <tr><td colSpan={8} className="muted">Todavía no hay visitantes.</td></tr>}
            {(guests ?? []).map((g) => (
              <tr key={g.id}>
                <td>{safeEmail(g.email_enc)}</td><td>{verifiedIds.has(g.id) ? "Sí" : "No"}</td><td>{g.full_name ?? "—"}</td><td>{g.visit_count}</td>
                <td>{when(g.first_seen_at)}</td><td>{when(g.last_seen_at)}</td>
                <td>{marketing.get(g.id) ? "Sí" : "No"}</td>
                <td><form action={deleteGuest}><input type="hidden" name="id" value={g.id} /><button className="danger">Eliminar</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Eliminar borra al visitante, sus consentimientos y sus sesiones.</p>
      </div>

      <div className="card scroll">
        <h2>Últimas sesiones</h2>
        <table className="table">
          <thead><tr><th>Inicio</th><th>Estado</th><th>Fin</th><th>Descarga</th><th>Subida</th></tr></thead>
          <tbody>
            {(sessions ?? []).length === 0 && <tr><td colSpan={5} className="muted">Sin sesiones.</td></tr>}
            {(sessions ?? []).map((x) => (
              <tr key={x.id}>
                <td>{when(x.started_at)}</td><td>{STATUS[x.status] ?? x.status}</td><td>{when(x.ended_at)}</td>
                <td>{formatBytes(Number(x.bytes_in))}</td><td>{formatBytes(Number(x.bytes_out))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
