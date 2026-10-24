import { createAdminClient } from "@/lib/supabase";
import { ensureParentQueue, hasSharing, syncBandwidthProfile, upsertFixedQueue, type RouterConfig } from "@/lib/mikrotik";
import { selectPlans, tuningOf } from "@/lib/plans";

export type SharingResult = { profiles: number; profilesTotal: number; fixed: number; fixedWithoutIp: number };

/**
 * Aplica en el router el reparto del ancho de banda de un establecimiento: cola padre con el internet contratado,
 * perfiles de velocidad (colgados de ella, con su mínimo y ráfaga) y una cola por cada equipo fijo con IP.
 * Sin capacidad configurada solo sube los perfiles, como antes. Solo servidor.
 */
export async function applySharing(tenantId: string, cfg: RouterConfig): Promise<SharingResult> {
  const sharing = hasSharing(cfg);
  if (sharing) await ensureParentQueue(cfg); // primero el padre: los perfiles cuelgan de él

  const db = createAdminClient();
  const plans = await selectPlans((cols) => db.from("bandwidth_profiles").select(cols).eq("tenant_id", tenantId));
  let profiles = 0;
  for (const p of plans) {
    try {
      await syncBandwidthProfile(cfg, p.name, p.download_kbps, p.upload_kbps, tuningOf(p));
      profiles++;
    } catch (e) {
      console.error("applySharing perfil:", e instanceof Error ? e.message : "error");
    }
  }

  let fixed = 0, fixedWithoutIp = 0;
  if (sharing) {
    const { data, error } = await db.from("fixed_devices")
      .select("mac, ip, max_down_kbps, max_up_kbps, min_kbps").eq("tenant_id", tenantId);
    if (!error) {
      for (const d of data ?? []) {
        if (!d.ip) { fixedWithoutIp++; continue; }
        try {
          await upsertFixedQueue(cfg, {
            mac: d.mac, ip: d.ip, downKbps: d.max_down_kbps ?? 0, upKbps: d.max_up_kbps ?? 0, minKbps: d.min_kbps ?? DEFAULT_FIXED_MIN_KBPS,
          });
          fixed++;
        } catch (e) {
          console.error("applySharing equipo fijo:", e instanceof Error ? e.message : "error");
        }
      }
    }
  }
  return { profiles, profilesTotal: plans.length, fixed, fixedWithoutIp };
}

/** Garantía de un equipo fijo cuando no se indica otra. */
export const DEFAULT_FIXED_MIN_KBPS = 512;
