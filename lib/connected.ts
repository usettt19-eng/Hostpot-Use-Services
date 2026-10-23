// Quién está conectado ahora: cruza las sesiones del router con los usuarios del portal. Funciones puras.

export type Active = { user: string; address: string; mac: string; uptime: string; bytes: number; loginBy: string };
export type PortalUser = { name: string; role: string };
export type Kind = "user" | "guest" | "other";
export type Connected = Active & { kind: Kind; name: string | null; role: string | null };

/** Usuario temporal de un visitante (prefijo reservado `g_`). */
export const isGuestUser = (u: string) => u.startsWith("g_");

export function classify(active: Active[], users: Map<string, PortalUser>): Connected[] {
  return active
    .map((a): Connected => {
      const u = users.get(a.user.toLowerCase());
      if (u) return { ...a, kind: "user", name: u.name, role: u.role };
      if (isGuestUser(a.user)) return { ...a, kind: "guest", name: null, role: null };
      return { ...a, kind: "other", name: null, role: null };
    })
    .sort((x, y) => (x.name ?? x.user).localeCompare(y.name ?? y.user) || x.address.localeCompare(y.address));
}

export function counts(rows: Connected[]) {
  const people = new Set(rows.filter((r) => r.kind === "user").map((r) => r.user.toLowerCase()));
  return {
    devices: rows.length,
    users: people.size,
    userDevices: rows.filter((r) => r.kind === "user").length,
    guests: rows.filter((r) => r.kind === "guest").length,
    other: rows.filter((r) => r.kind === "other").length,
  };
}
