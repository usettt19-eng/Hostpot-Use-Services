// Panel del dueño de la plataforma: quién es y cómo se resume cada establecimiento. Funciones puras.

/** Correos autorizados (variable PLATFORM_ADMIN_EMAILS, separados por coma). Sin variable, nadie lo es. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined, raw = process.env.PLATFORM_ADMIN_EMAILS): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.trim().toLowerCase());
}

export type TenantRow = { id: string; name: string; slug: string; type: string; created_at: string };
export type ProfileRow = { tenant_id: string; status: string };
export type GuestRow = { tenant_id: string };
export type SessionRow = { tenant_id: string; status: string; started_at: string };
export type SuspensionRow = { tenant_id: string; suspended_at: string; reason: string | null };

export type TenantSummary = TenantRow & {
  users: number; pending: number; guests: number; connections30: number; routerConfigured: boolean;
  suspended: boolean; suspendedAt: string | null; reason: string | null;
};

export function summarizeTenants(
  tenants: TenantRow[], profiles: ProfileRow[], guests: GuestRow[], sessions: SessionRow[],
  suspensions: SuspensionRow[], routers: Set<string>, now: Date,
): TenantSummary[] {
  const since = now.getTime() - 30 * 86_400_000;
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const users = new Map<string, number>(), pending = new Map<string, number>();
  const gst = new Map<string, number>(), conn = new Map<string, number>();
  for (const p of profiles) { if (p.status === "active") bump(users, p.tenant_id); if (p.status === "pending") bump(pending, p.tenant_id); }
  for (const g of guests) bump(gst, g.tenant_id);
  for (const s of sessions) {
    if ((s.status === "active" || s.status === "ended") && Date.parse(s.started_at) >= since) bump(conn, s.tenant_id);
  }
  const susp = new Map(suspensions.map((s) => [s.tenant_id, s]));
  return tenants.map((t) => ({
    ...t,
    users: users.get(t.id) ?? 0, pending: pending.get(t.id) ?? 0,
    guests: gst.get(t.id) ?? 0, connections30: conn.get(t.id) ?? 0,
    routerConfigured: routers.has(t.id),
    suspended: susp.has(t.id), suspendedAt: susp.get(t.id)?.suspended_at ?? null, reason: susp.get(t.id)?.reason ?? null,
  }));
}
