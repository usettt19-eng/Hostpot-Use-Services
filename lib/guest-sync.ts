import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { isConfigured, listActiveUsers, listGuestUsers, deleteHotspotUser } from "@/lib/mikrotik";

/**
 * Pone al día las sesiones de invitados con lo que dice el router (a demanda, no hay proceso en segundo plano todavía).
 * - Con sesión abierta: "active" y contadores.
 * - Sin sesión abierta pero ya usada (o pasados 10 minutos sin entrar): "ended", con los contadores finales,
 *   y se borra el usuario temporal del router.
 */
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
    [users, active] = await Promise.all([listGuestUsers(cfg), listActiveUsers(cfg)]);
  } catch {
    return { checked: open.length, ended: 0, error: "No se pudo consultar el router" };
  }
  const byName = new Map(users.map((u) => [u.name, u]));
  const now = Date.now();
  let ended = 0;

  for (const s of open) {
    const u = byName.get(s.hotspot_username);
    if (active.has(s.hotspot_username)) {
      await db.from("guest_sessions")
        .update({ status: "active", bytes_in: u?.bytesIn ?? 0, bytes_out: u?.bytesOut ?? 0 }).eq("id", s.id);
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
