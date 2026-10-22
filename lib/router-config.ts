import { normalizeFingerprint } from "./mikrotik.ts";

// Validación de la conexión del portal con el router de un establecimiento (la guarda el dueño de la plataforma).

export type RouterInput = { url: string; user: string; password: string; fingerprint: string; hasPassword: boolean };
export type RouterValid = { ok: true; url: string; user: string; password: string | null; fingerprint: string | null } | { ok: false; error: string };

const HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,98}[A-Za-z0-9])?)$/;

export function validateRouterInput(i: RouterInput): RouterValid {
  let u: URL;
  try { u = new URL(i.url.trim()); } catch { return { ok: false, error: "La URL del router no es válida (ej. https://10.99.0.3)" }; }
  if (u.protocol !== "https:") return { ok: false, error: "La URL del router debe empezar con https://" };
  if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash)
    return { ok: false, error: "Escribe solo la dirección, sin usuario, ruta ni parámetros (ej. https://10.99.0.3)" };
  if (!HOST.test(u.hostname)) return { ok: false, error: "Dirección del router no válida" };
  const user = i.user.trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(user)) return { ok: false, error: "Usuario no válido (letras, números, punto, guion)" };
  const password = i.password; // puede llevar cualquier carácter; no se recorta
  if (!password && !i.hasPassword) return { ok: false, error: "Escribe la contraseña del usuario del router" };
  const fp = normalizeFingerprint(i.fingerprint);
  if (fp && fp.length !== 64) return { ok: false, error: "La huella SHA-256 debe tener 64 caracteres hexadecimales (32 pares). Cópiala del bloque 2 de la configuración" };
  return { ok: true, url: `https://${u.host}`, user, password: password || null, fingerprint: fp || null };
}
