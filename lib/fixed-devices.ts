import { isMac, isIPv4, normalizeMac } from "./guest-utils.ts";

export type FixedDeviceInput = {
  mac: string; name: string; ip: string; location: string; reason: string;
  /** Opcionales, en Mbps (texto del formulario). Requieren IP fija. */
  maxDownMbps?: string; maxUpMbps?: string; minMbps?: string;
};
export type FixedSpeeds = { max_down_kbps?: number; max_up_kbps?: number; min_kbps?: number };

/** Mbps escritos a mano ("4", "1,5") a kbps (1 Mbps = 1024 kbps). Vacío = sin valor. */
function mbps(raw: string | undefined, label: string): { ok: true; kbps: number | null } | { ok: false; error: string } {
  const t = (raw ?? "").trim().replace(",", ".");
  if (!t) return { ok: true, kbps: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return { ok: false, error: `${label}: escribe un número de Mbps mayor que 0` };
  return { ok: true, kbps: Math.max(64, Math.round(n * 1024)) };
}

/** Valida y normaliza los datos de un equipo fijo. Devuelve el error o los datos limpios. */
export function parseFixedDevice(raw: FixedDeviceInput):
  | { ok: true; data: { mac: string; name: string; ip: string | null; location: string | null; reason: string | null } & FixedSpeeds }
  | { ok: false; error: string } {
  const mac = normalizeMac(raw.mac);
  if (!isMac(mac)) return { ok: false, error: "La MAC debe tener el formato AA:BB:CC:DD:EE:FF" };
  const name = raw.name.trim();
  if (!name || name.length > 80) return { ok: false, error: "Escribe un nombre de hasta 80 caracteres" };
  const ip = raw.ip.trim();
  if (ip && !isIPv4(ip)) return { ok: false, error: "La IP no es válida" };
  const location = raw.location.trim().slice(0, 80);
  const reason = raw.reason.trim().slice(0, 200);
  const down = mbps(raw.maxDownMbps, "Bajada máxima");
  if (!down.ok) return down;
  const up = mbps(raw.maxUpMbps, "Subida máxima");
  if (!up.ok) return up;
  const min = mbps(raw.minMbps, "Mínimo garantizado");
  if (!min.ok) return min;
  const speeds: FixedSpeeds = {
    ...(down.kbps ? { max_down_kbps: down.kbps } : {}), ...(up.kbps ? { max_up_kbps: up.kbps } : {}), ...(min.kbps ? { min_kbps: min.kbps } : {}),
  };
  if (!!down.kbps !== !!up.kbps) return { ok: false, error: "Escribe la bajada y la subida máximas juntas, o ninguna" };
  return { ok: true, data: { mac, name, ip: ip || null, location: location || null, reason: reason || null, ...speeds } };
}

/** Estado de un equipo frente al router, según si su excepción sigue existiendo. */
export function bindingStatus(routerBindingId: string | null, routerIds: Set<string> | null): "aplicado" | "no encontrado en el router" | "sin router" {
  if (routerIds === null) return "sin router";
  if (!routerBindingId) return "no encontrado en el router";
  return routerIds.has(routerBindingId) ? "aplicado" : "no encontrado en el router";
}
