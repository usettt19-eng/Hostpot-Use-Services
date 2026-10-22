// Estadísticas de visitantes del portal. Funciones puras: reciben filas y devuelven números.
// Los días se cuentan en hora de Panamá (UTC-5 todo el año, sin horario de verano).

const DAY_MS = 86_400_000;
const OFFSET_MS = 5 * 3_600_000;

export type Gran = "day" | "week" | "month";
export type SessionRow = { guest_id: string; started_at: string; ended_at: string | null; status: string };
export type GuestRow = { id: string; first_seen_at: string };

export const RANGES: Record<string, { days: number; gran: Gran; label: string }> = {
  "7": { days: 7, gran: "day", label: "7 días" },
  "30": { days: 30, gran: "day", label: "30 días" },
  "90": { days: 90, gran: "week", label: "90 días" },
  "365": { days: 365, gran: "month", label: "12 meses" },
};

/** Número de día local (días desde 1970-01-01 en Panamá). */
export const localDay = (ms: number) => Math.floor((ms - OFFSET_MS) / DAY_MS);
const dayDate = (d: number) => new Date(d * DAY_MS); // UTC del día local, para leer año/mes/día
const monthKey = (d: number) => { const x = dayDate(d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
const monthStartDay = (key: number) => Date.UTC(Math.floor(key / 12), key % 12, 1) / DAY_MS;
/** Lunes de la semana a la que pertenece el día (el 1 de enero de 1970 fue jueves). */
const weekStart = (d: number) => d - ((d + 3) % 7);

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
export const WEEKDAY_NAMES = WEEKDAYS;

function labelFor(start: number, gran: Gran): string {
  const x = dayDate(start);
  if (gran === "month") return `${MONTHS[x.getUTCMonth()]} ${String(x.getUTCFullYear()).slice(2)}`;
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
}

export type Bucket = { start: number; label: string; visits: number; unique: number; fresh: number; returning: number };
export type Summary = { visits: number; unique: number; fresh: number; returning: number; avgMinutes: number | null };

/** Una sesión cuenta como visita si llegó a conectarse. */
const counts = (s: SessionRow) => s.status === "active" || s.status === "ended";

function summarize(sessions: SessionRow[], first: Map<string, number>, from: number, to: number): Summary {
  const seen = new Set<string>();
  const fresh = new Set<string>();
  let visits = 0, durSum = 0, durN = 0;
  for (const s of sessions) {
    if (!counts(s)) continue;
    const t = Date.parse(s.started_at);
    const d = localDay(t);
    if (d < from || d > to) continue;
    visits++;
    seen.add(s.guest_id);
    const f = first.get(s.guest_id);
    if (f !== undefined && f >= from && f <= to) fresh.add(s.guest_id);
    if (s.status === "ended" && s.ended_at) {
      const m = (Date.parse(s.ended_at) - t) / 60_000;
      if (m > 0 && m < 24 * 60) { durSum += m; durN++; }
    }
  }
  return { visits, unique: seen.size, fresh: fresh.size, returning: seen.size - fresh.size, avgMinutes: durN ? durSum / durN : null };
}

export type Stats = {
  from: number; to: number; gran: Gran;
  buckets: Bucket[];
  current: Summary; previous: Summary;
  byHour: number[]; byWeekday: number[];
};

export function buildStats(sessions: SessionRow[], guests: GuestRow[], now: Date, days: number, gran: Gran): Stats {
  const to = localDay(now.getTime());
  const from = gran === "month" ? monthStartDay(monthKey(to) - 11) : to - days + 1;
  const len = to - from + 1;
  const first = new Map(guests.map((g) => [g.id, localDay(Date.parse(g.first_seen_at))]));

  const keyOf = (d: number) => (gran === "day" ? d : gran === "week" ? weekStart(d) : monthStartDay(monthKey(d)));
  const starts: number[] = [];
  for (let d = from; d <= to; d++) { const k = keyOf(d); if (starts[starts.length - 1] !== k) starts.push(k); }
  const idx = new Map(starts.map((k, i) => [k, i]));
  const visitors = starts.map(() => new Set<string>());
  const freshSet = starts.map(() => new Set<string>());
  const visits = starts.map(() => 0);
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);

  for (const s of sessions) {
    if (!counts(s)) continue;
    const t = Date.parse(s.started_at);
    const d = localDay(t);
    if (d < from || d > to) continue;
    const i = idx.get(keyOf(d));
    if (i === undefined) continue;
    visits[i]++;
    visitors[i].add(s.guest_id);
    const f = first.get(s.guest_id);
    if (f !== undefined && keyOf(f) === starts[i]) freshSet[i].add(s.guest_id);
    byHour[new Date(t - OFFSET_MS).getUTCHours()]++;
    byWeekday[(d + 3) % 7]++;
  }

  const buckets = starts.map((start, i) => ({
    start, label: labelFor(start, gran), visits: visits[i],
    unique: visitors[i].size, fresh: freshSet[i].size, returning: visitors[i].size - freshSet[i].size,
  }));
  return {
    from, to, gran, buckets,
    current: summarize(sessions, first, from, to),
    previous: summarize(sessions, first, from - len, from - 1),
    byHour, byWeekday,
  };
}

/** Cambio porcentual frente al periodo anterior; null si no hay base para comparar. */
export function delta(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Resumen de un rango de días terminando hoy (para las tarjetas de hoy / 7 / 30 días). */
export function quick(sessions: SessionRow[], guests: GuestRow[], now: Date, days: number) {
  const first = new Map(guests.map((g) => [g.id, localDay(Date.parse(g.first_seen_at))]));
  const to = localDay(now.getTime());
  return {
    current: summarize(sessions, first, to - days + 1, to),
    previous: summarize(sessions, first, to - 2 * days + 1, to - days),
  };
}
