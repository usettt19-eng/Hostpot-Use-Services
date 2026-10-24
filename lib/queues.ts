// Reparto del ancho de banda con colas de RouterOS. Funciones puras (el router se toca en lib/mikrotik.ts).

export const PARENT_QUEUE = "PORTAL-ROOT";
export const FIXED_POOL = "FIXED-POOL";
// Tipos PCQ que RouterOS ya trae de fábrica (bajada por destino, subida por origen, sin tope por dirección): no se crea nada
export const PCQ_DOWN = "pcq-download-default";
export const PCQ_UP = "pcq-upload-default";

export type SharingMode = "roles" | "equal";
export const parseMode = (v: unknown): SharingMode => (v === "equal" ? "equal" : "roles");
export const FIXED_PREFIX = "FIXED-";

export type RateInput = { downloadKbps: number; uploadKbps: number; minKbps?: number; burstKbps?: number };

/**
 * Valor de `rate-limit` del perfil del Hotspot. RouterOS lo lee como
 * `rx/tx rx-burst/tx-burst umbral-rx/umbral-tx tiempo-rx/tiempo-tx prioridad mínimo-rx/mínimo-tx`,
 * desde la perspectiva del router: rx = lo que sube el cliente, tx = lo que descarga.
 * Sin mínimo ni ráfaga queda el formato simple `subida/bajada`. Formato comprobado en un router real (7.12).
 */
export function buildRateLimit(r: RateInput): string {
  const up = Math.max(1, Math.round(r.uploadKbps));
  const down = Math.max(1, Math.round(r.downloadKbps));
  const base = `${up}k/${down}k`;
  const min = Math.max(0, Math.round(r.minKbps ?? 0));
  const burst = Math.max(0, Math.round(r.burstKbps ?? 0));
  if (!min && !burst) return base;
  // El mínimo nunca puede superar el máximo de ese sentido
  const minUp = Math.min(min, up), minDown = Math.min(min, down);
  // Verificado en RouterOS 7.12: el tiempo de ráfaga va en segundos SIN la letra «s» (con «s» da «invalid rate-limit»)
  // y «0/0» en los campos de ráfaga significa sin ráfaga.
  if (!burst || (burst <= up && burst <= down)) return `${base} 0/0 0/0 0/0 8 ${minUp}k/${minDown}k`;
  // Ráfaga: por encima del máximo, hasta el umbral (1/8 del máximo) durante 8 s
  const bUp = Math.max(up, burst), bDown = Math.max(down, burst);
  const thrUp = Math.max(1, Math.round(up / 8)), thrDown = Math.max(1, Math.round(down / 8));
  return `${base} ${bUp}k/${bDown}k ${thrUp}k/${thrDown}k 8/8 8 ${minUp}k/${minDown}k`;
}

/** Red del Hotspot en notación CIDR privada (por ejemplo 192.168.200.0/24). Devuelve el valor limpio o el error. */
export function parseNetwork(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(raw.trim());
  const bad = { ok: false as const, error: "Escribe la red del WiFi con máscara, por ejemplo 192.168.200.0/24" };
  if (!m) return bad;
  const o = m.slice(1, 5).map(Number);
  const bits = Number(m[5]);
  if (o.some((n) => n > 255) || bits < 8 || bits > 30) return bad;
  const priv = o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
  if (!priv) return { ok: false, error: "La red del WiFi debe ser privada (10.x, 172.16-31.x o 192.168.x)" };
  return { ok: true, value: `${o.join(".")}/${bits}` };
}

/** Megabits (con decimales) a kbps, con la convención del panel: 1 Mbps = 1024 kbps. */
export const mbpsToKbps = (mbps: number) => Math.round(mbps * 1024);

export type CapacityInput = { downMbps: number; upMbps: number };
export function validateCapacity(c: CapacityInput): string | null {
  for (const v of [c.downMbps, c.upMbps]) {
    if (!Number.isFinite(v) || v < 1 || v > 100_000) return "Escribe la velocidad de internet contratada en Mbps (entre 1 y 100.000)";
  }
  return null;
}

/** Cuántos clientes caben con su mínimo garantizado a la vez (el peor caso); sirve para avisar si la garantía no cuadra. */
export function guaranteeFit(totalKbps: number, minKbps: number): number | null {
  return minKbps > 0 ? Math.floor(totalKbps / minKbps) : null;
}

/** Nombre de la cola de un equipo fijo. */
export const fixedQueueName = (mac: string) => `${FIXED_PREFIX}${mac.toUpperCase()}`;

export type FixedDeviceQ = { mac: string; ip: string | null; max_down_kbps: number | null; max_up_kbps: number | null; min_kbps: number | null };

/**
 * Reparte los equipos fijos entre los que tienen cola propia (si el administrador les puso un tope) y el grupo
 * que se reparte por igual con PCQ. Sin IP fija no se les puede poner cola.
 */
export function splitFixed(devices: FixedDeviceQ[]) {
  const individual: (FixedDeviceQ & { ip: string })[] = [];
  const pool: (FixedDeviceQ & { ip: string })[] = [];
  let withoutIp = 0;
  for (const d of devices) {
    if (!d.ip) { withoutIp++; continue; }
    const own = (d.max_down_kbps ?? 0) > 0 || (d.max_up_kbps ?? 0) > 0;
    (own ? individual : pool).push({ ...d, ip: d.ip });
  }
  return { individual, pool, withoutIp };
}

/** Objetivo de la cola del grupo: las IP de sus equipos separadas por coma. */
export const poolTarget = (pool: { ip: string }[]) => [...new Set(pool.map((d) => `${d.ip}/32`))].join(",");

/** Garantía del grupo: la suma de las de sus equipos, sin pasar de la cuarta parte del internet contratado. */
export function poolGuarantee(pool: { min_kbps: number | null }[], defaultMin: number, totalKbps: number): number {
  const sum = pool.reduce((n, d) => n + (d.min_kbps ?? defaultMin), 0);
  return Math.min(sum, Math.floor(totalKbps / 4));
}
