import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ROLE_LABEL, isAdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const SHORTCUTS = [
  { href: "/admin/users", t: "Usuarios", d: "Aprobar, crear o suspender cuentas" },
  { href: "/admin/portal", t: "Portal de bienvenida", d: "Diseño, términos y horarios" },
  { href: "/admin/connected", t: "Conectados ahora", d: "Quién está en la red" },
  { href: "/admin/stats", t: "Estadísticas", d: "Visitantes por día, semana y mes" },
  { href: "/admin/bandwidth", t: "Ancho de banda", d: "Velocidad y dispositivos por rol" },
  { href: "/admin/fixed-devices", t: "Equipos fijos", d: "Impresoras y pantallas" },
];

/** Medianoche de hoy en Panamá (UTC-5 todo el año), en ISO. */
function startOfTodayPanama(now = Date.now()) {
  const off = 5 * 3_600_000;
  return new Date(Math.floor((now - off) / 86_400_000) * 86_400_000 + off).toISOString();
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles").select("full_name, role, status").eq("id", auth.user!.id).single();
  const { data: bw } = await supabase
    .from("bandwidth_profiles").select("name, download_kbps, upload_kbps, max_devices").eq("role", me?.role ?? "").maybeSingle();
  const { data: hu } = await supabase.from("hotspot_users").select("username, disabled").eq("profile_id", auth.user!.id).maybeSingle();

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

  const isAdmin = !!me && isAdminRole(me.role);
  let counts = { pending: 0, active: 0, today: 0, now: 0 };
  if (isAdmin) {
    const n = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    const [pending, active, today, now] = await Promise.all([
      n(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending")),
      n(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active")),
      n(supabase.from("guest_sessions").select("id", { count: "exact", head: true }).in("status", ["active", "ended"]).gte("started_at", startOfTodayPanama())),
      n(supabase.from("guest_sessions").select("id", { count: "exact", head: true }).eq("status", "active")),
    ]);
    counts = { pending, active, today, now };
  }

  const first = (me?.full_name ?? "").split(" ")[0];
  return (
    <>
      <div className="card">
        <h1>Hola, {first}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {me ? ROLE_LABEL[me.role] : ""}
          {bw && <> · Tu plan de red: <b>{bw.name}</b>, {(bw.download_kbps / 1024).toFixed(0)} Mbps de bajada y {(bw.upload_kbps / 1024).toFixed(0)} Mbps de subida, hasta {bw.max_devices} {bw.max_devices === 1 ? "dispositivo" : "dispositivos"}</>}
          {hu && <> · Usuario de WiFi: <code>{hu.username}</code> {hu.disabled && <span className="badge suspended">deshabilitado</span>}</>}
        </p>
      </div>

      {isAdmin && (
        <>
          <div className="tiles">
            <Link href="/admin/users" className={`tile${counts.pending ? " alert" : ""}`}>
              <span className="k">Pendientes de aprobar</span>
              <span className="n">{counts.pending}</span>
              <span className="s">{counts.pending ? "Esperan tu aprobación" : "Todo al día"}</span>
            </Link>
            <Link href="/admin/users" className="tile">
              <span className="k">Usuarios activos</span>
              <span className="n">{counts.active}</span>
              <span className="s">Con cuenta en el portal</span>
            </Link>
            <Link href="/admin/stats" className="tile">
              <span className="k">Visitantes hoy</span>
              <span className="n">{counts.today}</span>
              <span className="s">Conexiones desde las 00:00</span>
            </Link>
            <Link href="/admin/connected" className="tile">
              <span className="k">Visitantes conectados</span>
              <span className="n">{counts.now}</span>
              <span className="s">En este momento</span>
            </Link>
          </div>
          <div className="card">
            <h2>Accesos rápidos</h2>
            <div className="shortcuts">
              {SHORTCUTS.map((s) => (
                <Link key={s.href} href={s.href}><span><b>{s.t}</b><small>{s.d}</small></span></Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
