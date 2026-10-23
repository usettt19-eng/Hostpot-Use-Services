// Historial de conexiones de los usuarios del portal: decide qué sesiones abrir, actualizar o cerrar. Funciones puras.

export type ActiveUser = { user: string; address: string; mac: string; uptime: string; bytes: number };
export type OpenRow = { id: string; username: string; mac_hash: string };
export type UserInfo = { profileId: string };

export type SyncPlan = {
  inserts: { profile_id: string; username: string; mac_hash: string; ip: string; started_at: string; last_seen_at: string; bytes: number }[];
  updates: { id: string; ip: string; last_seen_at: string; bytes: number }[];
  closes: { id: string; ended_at: string }[];
};

/** RouterOS da el tiempo conectado como "1w2d3h4m5s". Devuelve milisegundos (0 si no se entiende). */
export function parseUptime(s: string): number {
  const re = /(\d+)([wdhms])/g;
  const unit: Record<string, number> = { w: 604_800_000, d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };
  let ms = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s ?? ""))) ms += Number(m[1]) * unit[m[2]];
  return ms;
}

export const RETENTION_DAYS = 90;

/**
 * `active`: sesiones del router de usuarios del portal; `open`: filas sin cerrar en la base.
 * Una sesión es un (usuario, dispositivo). Lo abierto que ya no está en el router se cierra.
 */
export function planStaffSync(
  active: ActiveUser[], open: OpenRow[], users: Map<string, UserInfo>, now: Date, hash: (mac: string) => string,
): SyncPlan {
  const iso = now.toISOString();
  const key = (u: string, h: string) => `${u.toLowerCase()}|${h}`;
  const openByKey = new Map(open.map((o) => [key(o.username, o.mac_hash), o]));
  const seen = new Set<string>();
  const plan: SyncPlan = { inserts: [], updates: [], closes: [] };

  for (const a of active) {
    const u = users.get(a.user.toLowerCase());
    if (!u || !a.mac) continue;
    const h = hash(a.mac);
    const k = key(a.user, h);
    if (seen.has(k)) continue; // el mismo usuario y dispositivo dos veces en la misma lectura
    seen.add(k);
    const o = openByKey.get(k);
    if (o) {
      plan.updates.push({ id: o.id, ip: a.address, last_seen_at: iso, bytes: a.bytes });
    } else {
      const started = new Date(now.getTime() - Math.min(parseUptime(a.uptime), 30 * 86_400_000)).toISOString();
      plan.inserts.push({ profile_id: u.profileId, username: a.user.toLowerCase(), mac_hash: h, ip: a.address, started_at: started, last_seen_at: iso, bytes: a.bytes });
    }
  }
  for (const o of open) if (!seen.has(key(o.username, o.mac_hash))) plan.closes.push({ id: o.id, ended_at: iso });
  return plan;
}

export type HistoryRow = {
  profile_id: string; mac_hash: string; started_at: string; last_seen_at: string; ended_at: string | null; bytes: number;
};
export type PersonSummary = { profileId: string; sessions: number; devices: number; totalMs: number; days: number; lastSeen: string; online: boolean };

const OFFSET_MS = 5 * 3_600_000; // Panamá, UTC-5 todo el año
const localDay = (ms: number) => Math.floor((ms - OFFSET_MS) / 86_400_000);

/** Resumen por persona: sesiones, dispositivos distintos, tiempo (suma de dispositivos), días con conexión y último acceso. */
export function summarizeHistory(rows: HistoryRow[]): PersonSummary[] {
  const by = new Map<string, { s: number; macs: Set<string>; ms: number; days: Set<number>; last: string; online: boolean }>();
  for (const r of rows) {
    const e = by.get(r.profile_id) ?? { s: 0, macs: new Set<string>(), ms: 0, days: new Set<number>(), last: "", online: false };
    const start = Date.parse(r.started_at);
    const end = Date.parse(r.ended_at ?? r.last_seen_at);
    e.s++; e.macs.add(r.mac_hash);
    e.ms += Math.max(0, end - start);
    for (let d = localDay(start); d <= localDay(Math.max(start, end)); d++) e.days.add(d);
    const seen = r.ended_at ?? r.last_seen_at;
    if (!e.last || seen > e.last) e.last = seen;
    if (!r.ended_at) e.online = true;
    by.set(r.profile_id, e);
  }
  return [...by.entries()]
    .map(([profileId, e]) => ({ profileId, sessions: e.s, devices: e.macs.size, totalMs: e.ms, days: e.days.size, lastSeen: e.last, online: e.online }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function formatDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "menos de 1 min";
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}
