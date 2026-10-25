import { timingSafeEqual } from "node:crypto";

// Verificación del correo con un código de 6 dígitos. Función pura: el azar y el HMAC se inyectan para poder probarla.

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 3;                 // por correo
export const OTP_SEND_WINDOW_MS = 15 * 60_000;  // ...dentro de esta ventana
export const OTP_COOLDOWN_MS = 30_000;          // espera mínima entre dos envíos al mismo correo

/** Seis dígitos, con ceros a la izquierda. `randomInt(max)` debe dar un entero uniforme en [0, max). */
export function generateCode(randomInt: (max: number) => number): string {
  return String(randomInt(1_000_000)).padStart(6, "0");
}

/** Solo los 6 dígitos (acepta espacios o guiones al pegar); si no son exactamente 6, "". */
export function normalizeCode(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 6 ? d : "";
}

export type SendCheck = { ok: true } | { ok: false; error: string };

/** ¿Se puede enviar otro código a este correo? `recent` = instantes de los envíos de los últimos 15 minutos. */
export function canSend(recent: Date[], now: Date): SendCheck {
  const t = now.getTime();
  const inWindow = recent.filter((d) => t - d.getTime() < OTP_SEND_WINDOW_MS);
  if (inWindow.length >= OTP_MAX_SENDS) return { ok: false, error: "Ya enviamos varios códigos a ese correo. Espera unos minutos e inténtalo de nuevo" };
  const last = Math.max(0, ...inWindow.map((d) => d.getTime()));
  if (last && t - last < OTP_COOLDOWN_MS) return { ok: false, error: "Espera unos segundos antes de pedir otro código" };
  return { ok: true };
}

export type OtpRecord = { codeHash: string; attempts: number; expiresAt: Date; consumedAt: Date | null };
export type CodeCheck = { ok: true } | { ok: false; error: string; countAttempt: boolean };

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** Comprueba el código escrito contra el último pendiente. `hash(code)` es el HMAC con el que se guardó. */
export function checkCode(rec: OtpRecord | null, given: string, hash: (code: string) => string, now: Date): CodeCheck {
  const code = normalizeCode(given);
  if (!rec || rec.consumedAt) return { ok: false, error: "Pide un código nuevo", countAttempt: false };
  if (rec.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "El código venció. Pide uno nuevo", countAttempt: false };
  if (rec.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Demasiados intentos. Pide un código nuevo", countAttempt: false };
  if (!code || !safeEqualHex(hash(code), rec.codeHash)) return { ok: false, error: "El código no es correcto", countAttempt: true };
  return { ok: true };
}

/** «ana.perez@correo.com» a «a•••@correo.com», para decirle adónde se envió sin mostrar el correo completo. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}•••@${domain}`;
}

/** Texto del correo (sin HTML). */
export function otpEmail(locale: "es" | "en", p: { place: string; code: string }): { subject: string; text: string } {
  const minutes = OTP_TTL_MS / 60_000;
  return locale === "en"
    ? {
        subject: `${p.code} is your ${p.place} WiFi code`,
        text: `Your code to connect to the WiFi at ${p.place} is:\n\n${p.code}\n\nIt expires in ${minutes} minutes. If you did not ask for it, ignore this message.`,
      }
    : {
        subject: `${p.code} es tu código del WiFi de ${p.place}`,
        text: `Tu código para conectarte al WiFi de ${p.place} es:\n\n${p.code}\n\nVence en ${minutes} minutos. Si no lo pediste, ignora este mensaje.`,
      };
}
