// Utilidades puras del flujo de invitados (sin dependencias de servidor; se prueban con node --test)

export const normalizeEmail = (v: string) => v.trim().toLowerCase();

/** Validación práctica (no pretende cubrir todo el RFC): una @, dominio con punto, sin espacios, hasta 254 caracteres. */
export const isValidEmail = (v: string) =>
  v.length <= 254 && /^[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"']{2,}$/.test(v);

export const normalizeMac = (v: string) => v.trim().toUpperCase().replace(/-/g, ":");
export const isMac = (v: string) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(v);

export const isIPv4 = (v: string) =>
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v);

const isPrivateIPv4 = (h: string) => {
  if (!isIPv4(h)) return false;
  const [a, b] = h.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

/**
 * La dirección de inicio de sesión del Hotspot llega por la URL, así que no es de fiar:
 * solo se acepta http(s)://<IP privada>[:puerto]/login, sin credenciales en la URL.
 */
export function parseLoginUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password || u.search || u.hash) return null;
    if (!isPrivateIPv4(u.hostname)) return null;
    if (u.pathname !== "/login") return null;
    return `${u.protocol}//${u.host}/login`;
  } catch {
    return null;
  }
}

/** Redirección al login del Hotspot con usuario y contraseña (el router la procesa como inicio de sesión). */
export function buildLoginRedirect(login: string, username: string, password: string, dst: string): string {
  const qs = new URLSearchParams({ username, password, ...(dst ? { dst } : {}) });
  return `${login}?${qs.toString()}`;
}

/** Destino original del visitante: solo http(s), sin credenciales y de largo razonable. Si no es válido, se descarta. */
export function sanitizeOrig(raw: string): string {
  if (!raw || raw.length > 500) return "";
  try {
    const u = new URL(raw);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) return "";
    return u.toString();
  } catch {
    return "";
  }
}

/** Solo dígitos y un "+" inicial opcional; entre 7 y 15 dígitos. Si no es válido, devuelve "". */
export function normalizePhone(raw: string): string {
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return (t.startsWith("+") ? "+" : "") + digits;
}

/** Minutos → formato de tiempo de RouterOS ("45m", "2h", "1h30m"). */
export function routerDuration(minutes: number): string {
  const m = Math.max(1, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h ? `${h}h` : ""}${r || !h ? `${r}m` : ""}`;
}

/** Celda de CSV segura: comillas dobles escapadas y sin interpretación de fórmulas en hojas de cálculo. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
