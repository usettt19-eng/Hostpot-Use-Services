import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { isConfigured, listActiveSessions, listGuestUsers, deleteHotspotUser } from "@/lib/mikrotik";

/**
 * Pone al día las sesiones de invitados con lo que dice el router (a demanda, no hay proceso en segundo plano todavía).
 * - Con sesión abierta: "active" y los contadores en vivo de /ip/hotspot/active.
 * - Sin sesión abierta pero ya usada (o pasados 10 minutos sin entrar): "ended", con los contadores finales,
 *   y se borra el usuario temporal del router.
 */
/** Sincroniza todos los establecimientos que tengan sesiones abiertas. Lo llama el proceso periódico. */
export async function syncAllGuestSessions(): Promise<{ tenants: number; checked: number; ended: number }> {
  const { data } = await createAdminClient()
    .from("guest_sessions").select("tenant_id").in("status", ["pending", "active"]).limit(5000);
  const tenants = [...new Set((data ?? []).map((r) => r.tenant_id as string))];
  let checked = 0;
  let ended = 0;
  for (const id of tenants) {
    const r = await syncGuestSessions(id);
    checked += r.checked;
    ended += r.ended;
  }
  return { tenants: tenants.length, checked, ended };
}

export async function syncGuestSessions(tenantId: string): Promise<{ checked: number; ended: number; error?: string }> {
  const db = createAdminClient();
  const { data: open } = await db
    .from("guest_sessions").select("id, hotspot_username, status, started_at")
    .eq("tenant_id", tenantId).in("status", ["pending", "active"]);
  if (!open?.length) return { checked: 0, ended: 0 };

  const cfg = await getRouterConfig(tenantId);
  if (!isConfigured(cfg)) return { checked: open.length, ended: 0, error: "El router no está configurado" };

  let users, active;
  try {
    [users, active] = await Promise.all([listGuestUsers(cfg), listActiveSessions(cfg)]);
  } catch {
    return { checked: open.length, ended: 0, error: "No se pudo consultar el router" };
  }
  const byName = new Map(users.map((u) => [u.name, u]));
  const now = Date.now();
  let ended = 0;

  for (const s of open) {
    const u = byName.get(s.hotspot_username);
    const live = active.get(s.hotspot_username);
    if (live) {
      // sesión en curso: los contadores en vivo están en /ip/hotspot/active
      await db.from("guest_sessions")
        .update({ status: "active", bytes_in: live.bytesIn, bytes_out: live.bytesOut }).eq("id", s.id);
      continue;
    }
    const usedBefore = !!u && u.uptime !== "0s";
    const waitedTooLong = now - new Date(s.started_at).getTime() > 10 * 60_000;
    if (!u || s.status === "active" || usedBefore || waitedTooLong) {
      await db.from("guest_sessions").update({
        status: "ended", ended_at: new Date().toISOString(),
        ...(u ? { bytes_in: u.bytesIn, bytes_out: u.bytesOut } : {}),
      }).eq("id", s.id);
      if (u) await deleteHotspotUser(cfg, u.name).catch(() => {});
      ended++;
    }
  }
  return { checked: open.length, ended };
}
