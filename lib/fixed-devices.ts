import { isMac, isIPv4, normalizeMac } from "./guest-utils.ts";

export type FixedDeviceInput = { mac: string; name: string; ip: string; location: string; reason: string };

/** Valida y normaliza los datos de un equipo fijo. Devuelve el error o los datos limpios. */
export function parseFixedDevice(raw: FixedDeviceInput):
  | { ok: true; data: { mac: string; name: string; ip: string | null; location: string | null; reason: string | null } }
  | { ok: false; error: string } {
  const mac = normalizeMac(raw.mac);
  if (!isMac(mac)) return { ok: false, error: "La MAC debe tener el formato AA:BB:CC:DD:EE:FF" };
  const name = raw.name.trim();
  if (!name || name.length > 80) return { ok: false, error: "Escribe un nombre de hasta 80 caracteres" };
  const ip = raw.ip.trim();
  if (ip && !isIPv4(ip)) return { ok: false, error: "La IP no es válida" };
  const location = raw.location.trim().slice(0, 80);
  const reason = raw.reason.trim().slice(0, 200);
  return { ok: true, data: { mac, name, ip: ip || null, location: location || null, reason: reason || null } };
}

/** Estado de un equipo frente al router, según si su excepción sigue existiendo. */
export function bindingStatus(routerBindingId: string | null, routerIds: Set<string> | null): "aplicado" | "no encontrado en el router" | "sin router" {
  if (routerIds === null) return "sin router";
  if (!routerBindingId) return "no encontrado en el router";
  return routerIds.has(routerBindingId) ? "aplicado" : "no encontrado en el router";
}
