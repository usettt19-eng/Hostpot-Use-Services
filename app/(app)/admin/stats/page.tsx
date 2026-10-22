import { createClient } from "@/lib/supabase";
import { requireAdminTenant } from "@/lib/portal";
import { RANGES, WEEKDAY_NAMES, buildStats, quick, type Summary } from "@/lib/stats";
import { Columns, Kpi, nf } from "@/components/stats/charts";

export const dynamic = "force-dynamic";

const LIMIT = 20_000; // filas máximas que se leen por consulta
const mins = (s: Summary) => s.avgMinutes;

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const key = range && RANGES[range] ? range : "30";
  const cfg = RANGES[key];
  await requireAdminTenant();
  const supabase = await createClient();
  const now = new Date();
  // Para comparar con el periodo anterior se leen dos periodos (el rango anual: 12 meses + los 365 días previos).
  const since = new Date(now.getTime() - (cfg.days * 2 + 35) * 86_400_000).toISOString();

  const [{ data: sess }, { data: gs }] = await Promise.all([
    supabase.from("guest_sessions").select("guest_id, started_at, ended_at, status")
      .gte("started_at", since).order("started_at", { ascending: false }).limit(LIMIT),
    supabase.from("guests").select("id, first_seen_at").limit(LIMIT),
  ]);
  const sessions = sess ?? [], guests = gs ?? [];
  const truncated = sessions.length >= LIMIT || guests.length >= LIMIT;

  const st = buildStats(sessions, guests, now, cfg.days, cfg.gran);
  const every = Math.ceil(st.buckets.length / 8);
  const unit = { day: "por día", week: "por semana", month: "por mes" }[cfg.gran];
  const q = { d1: quick(sessions, guests, now, 1), d7: quick(sessions, guests, now, 7), d30: quick(sessions, guests, now, 30) };
  const c = st.current;
  const tot = c.unique || 1;
  const fmtDay = (n: number) => new Date(n * 86_400_000).toLocaleDateString("es", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <div className="card">
        <h1>Estadísticas de visitantes</h1>
        <p className="muted">Resumen de quienes se conectaron por el portal. Las fechas usan la hora de Panamá. Cuenta solo las conexiones que llegaron a abrirse.</p>
        <div className="row ranges">
          {Object.entries(RANGES).map(([k, r]) => (
            <a key={k} href={`/admin/stats?range=${k}`} className={k === key ? "on" : ""} aria-current={k === key ? "page" : undefined}>{r.label}</a>
          ))}
        </div>
        {truncated && <p className="err">Hay más de {nf.format(LIMIT)} registros: las cifras pueden estar incompletas.</p>}
      </div>

      <div className="kpis">
        <Kpi label="Visitantes hoy" cur={q.d1.current.unique} prev={q.d1.previous.unique} />
        <Kpi label="Visitantes, últimos 7 días" cur={q.d7.current.unique} prev={q.d7.previous.unique} />
        <Kpi label="Visitantes, últimos 30 días" cur={q.d30.current.unique} prev={q.d30.previous.unique} />
        <Kpi label="Conexiones, últimos 30 días" cur={q.d30.current.visits} prev={q.d30.previous.visits} />
      </div>

      <div className="card">
        <h2>Visitantes {unit}</h2>
        <p className="muted">{fmtDay(st.from)} – {fmtDay(st.to)}. Pasa el cursor sobre una columna para ver el detalle.</p>
        <div className="legend">
          <span><i style={{ background: "var(--s1)" }} />Nuevos</span>
          <span><i style={{ background: "var(--s2)" }} />Recurrentes</span>
        </div>
        <Columns aName="Nuevos" bName="Recurrentes" every={every} aria={`Visitantes ${unit}, nuevos y recurrentes`}
          cols={st.buckets.map((b) => ({ label: b.label, tip: `${cfg.gran === "week" ? "Semana del " : ""}${b.label} · ${b.unique} visitantes · ${b.visits} conexiones`, a: b.fresh, b: b.returning }))} />
      </div>

      <div className="kpis">
        <Kpi label={`Visitantes (${cfg.label})`} cur={c.unique} prev={st.previous.unique} />
        <Kpi label="Conexiones" cur={c.visits} prev={st.previous.visits} />
        <Kpi label="Duración media (min)" cur={mins(c)} prev={mins(st.previous)} />
        <div className="kpi">
          <div className="l">Nuevos vs recurrentes</div>
          <div className="v">{Math.round((c.returning / tot) * 100)}% <span className="l">recurrentes</span></div>
          <div className="split" role="img" aria-label={`${c.fresh} nuevos y ${c.returning} recurrentes`}>
            <i style={{ background: "var(--s1)", width: `${(c.fresh / tot) * 100}%` }} />
            <i style={{ background: "var(--s2)", width: `${(c.returning / tot) * 100}%` }} />
          </div>
          <div className="d">{nf.format(c.fresh)} nuevos · {nf.format(c.returning)} recurrentes</div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Conexiones por hora del día</h2>
          <p className="muted">Cuándo se conecta la gente (hora local).</p>
          <Columns aName="Conexiones" every={3} aria="Conexiones por hora del día"
            cols={st.byHour.map((n, h) => ({ label: `${h}h`, tip: `${String(h).padStart(2, "0")}:00`, a: n }))} />
        </div>
        <div className="card">
          <h2>Conexiones por día de la semana</h2>
          <p className="muted">Qué días hay más movimiento.</p>
          <Columns aName="Conexiones" every={1} aria="Conexiones por día de la semana"
            cols={st.byWeekday.map((n, d) => ({ label: WEEKDAY_NAMES[d], tip: WEEKDAY_NAMES[d], a: n }))} />
        </div>
      </div>

      <details className="card scroll">
        <summary>Ver como tabla</summary>
        <table className="table">
          <thead><tr><th>Periodo</th><th>Visitantes</th><th>Nuevos</th><th>Recurrentes</th><th>Conexiones</th></tr></thead>
          <tbody>
            {[...st.buckets].reverse().map((b) => (
              <tr key={b.start}><td>{b.label}</td><td>{b.unique}</td><td>{b.fresh}</td><td>{b.returning}</td><td>{b.visits}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
