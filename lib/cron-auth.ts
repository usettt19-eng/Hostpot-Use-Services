import { timingSafeEqual } from "node:crypto";

/**
 * Autoriza una llamada periódica con "Authorization: Bearer <secreto>".
 * El secreto debe tener al menos 32 caracteres; si no, nada se autoriza.
 * La comparación es en tiempo constante.
 */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
