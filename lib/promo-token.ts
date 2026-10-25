import { parseLoginUrl, sanitizeOrig } from "./guest-utils.ts";

// Código cifrado que lleva la conexión pendiente del visitante a la página de la campaña. Así la contraseña de un solo uso
// nunca aparece en el HTML ni en la URL en claro: el servidor la abre al pulsar un botón y arma la redirección al router.
// Función pura: el cifrado se inyecta (en la aplicación es AES-GCM con ROUTER_CRED_KEY) para poder probarla sin claves.

export const PROMO_TOKEN_TTL_MS = 10 * 60_000;

export type PromoTicket = {
  tenantId: string;
  promoId: string;
  login: string;     // http(s)://<IP privada>/login del Hotspot
  username: string;  // g_<hex>
  password: string;
  next: string;      // destino original del visitante ("" si no hay)
};

type Crypto = { encrypt(plain: string): string; decrypt(blob: string): string };

const USER_RE = /^g_[0-9a-f]{4,20}$/;
const PASS_RE = /^[A-Za-z0-9_-]{6,64}$/;
const UUID_RE = /^[0-9a-f-]{36}$/;

export function sealPromoTicket(t: PromoTicket, c: Crypto, nowMs: number): string {
  const body = JSON.stringify({ k: "promo", e: nowMs + PROMO_TOKEN_TTL_MS, t: t.tenantId, i: t.promoId, l: t.login, u: t.username, p: t.password, n: t.next });
  return Buffer.from(c.encrypt(body), "utf8").toString("base64url");
}

/** Devuelve el pedido solo si el código es auténtico, no venció y todo su contenido sigue siendo válido; si no, null. */
export function openPromoTicket(token: string, c: Crypto, nowMs: number): PromoTicket | null {
  try {
    if (!token || token.length > 2000) return null;
    const o = JSON.parse(c.decrypt(Buffer.from(token, "base64url").toString("utf8")));
    if (o?.k !== "promo" || typeof o.e !== "number" || o.e < nowMs) return null;
    const login = parseLoginUrl(String(o.l));
    if (!login || !UUID_RE.test(String(o.t)) || !UUID_RE.test(String(o.i))) return null;
    if (!USER_RE.test(String(o.u)) || !PASS_RE.test(String(o.p))) return null;
    return { tenantId: o.t, promoId: o.i, login, username: o.u, password: o.p, next: sanitizeOrig(String(o.n ?? "")) };
  } catch {
    return null;
  }
}
