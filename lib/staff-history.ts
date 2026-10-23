import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { blindIndex } from "@/lib/crypto";
import { normalizeMac } from "@/lib/guest-utils";
import { isConfigured, listActiveDetails } from "@/lib/mikrotik";
import { RETENTION_DAYS, planStaffSync } from "@/lib/staff-sync";

/**
 * Pone al día el historial de conexiones de los usuarios del portal de un establecimiento con las sesiones del router.
 * Si el router no responde no cambia nada (para no cerrar sesiones por error). Borra lo que pase de 90 días.
 */
export async function syncStaffSessions(tenantId: string): Promise<{ opened: number; closed: number; error?: string }> {
  const cfg = await getRouterConfig(tenantId);
  if (!isConfigured(cfg)) return { opened: 0, closed: 0 };
  let active;
  try {
    active = await listActiveDetails(cfg);
  } catch {
    return { opened: 0, closed: 0, error: "No se pudo consultar el router" };
  }

  const db = createAdminClient();
  const [{ data: hu }, { data: open }] = await Promise.all([
    db.from("hotspot_users").select("username, profile_id").eq("tenant_id", tenantId),
    db.from("staff_sessions").select("id, username, mac_hash").eq("tenant_id", tenantId).is("ended_at", null),
  ]);
  const users = new Map((hu ?? []).map((r) => [r.username.toLowerCase(), { profileId: r.profile_id as string }]));
  const plan = planStaffSync(active, open ?? [], users, new Date(), (mac) => blindIndex(tenantId, normalizeMac(mac)));

  if (plan.inserts.length) {
    const { error } = await db.from("staff_sessions").insert(plan.inserts.map((r) => ({ ...r, tenant_id: tenantId })));
    if (error) console.error("staff_sessions insert:", error.code);
  }
  for (const u of plan.updates) {
    await db.from("staff_sessions").update({ ip: u.ip, last_seen_at: u.last_seen_at, bytes: u.bytes }).eq("id", u.id);
  }
  for (const c of plan.closes) await db.from("staff_sessions").update({ ended_at: c.ended_at }).eq("id", c.id);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  await db.from("staff_sessions").delete().eq("tenant_id", tenantId).lt("last_seen_at", cutoff);
  return { opened: plan.inserts.length, closed: plan.closes.length };
}

/** Todos los establecimientos con router configurado y no suspendidos. Lo llama el proceso periódico. */
export async function syncAllStaffSessions(): Promise<{ tenants: number; opened: number; closed: number }> {
  const db = createAdminClient();
  const [{ data: creds }, { data: susp }] = await Promise.all([
    db.from("tenant_router_credentials").select("tenant_id").not("router_url", "is", null).limit(5000),
    db.from("tenant_suspensions").select("tenant_id"),
  ]);
  const skip = new Set((susp ?? []).map((s) => s.tenant_id as string));
  const ids = (creds ?? []).map((c) => c.tenant_id as string).filter((id) => !skip.has(id));
  let opened = 0, closed = 0;
  for (const id of ids) {
    try {
      const r = await syncStaffSessions(id);
      opened += r.opened; closed += r.closed;
    } catch (e) {
      console.error("syncStaffSessions:", e instanceof Error ? e.message : "error");
    }
  }
  return { tenants: ids.length, opened, closed };
}
