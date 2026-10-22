// Nombres de usuario del Hotspot: únicos por establecimiento y sin chocar con los temporales de invitados (g_…).

const MAX = 20;

/** Parte local del correo, en minúsculas y solo con letras, números, punto, guion y guion bajo. */
export function baseUsername(email: string): string {
  let b = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!b) b = "usuario";
  if (b.startsWith("g_")) b = `p${b}`; // "g_" está reservado para los invitados temporales
  return b.slice(0, MAX);
}

/** Primer nombre libre: ana, ana2, ana3… `taken` debe venir en minúsculas. */
export function uniqueUsername(email: string, taken: Set<string>): string {
  const base = baseUsername(email);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10000; i++) {
    const s = `${base.slice(0, MAX - String(i).length)}${i}`;
    if (!taken.has(s)) return s;
  }
  throw new Error("No hay nombres de usuario libres para ese correo");
}
