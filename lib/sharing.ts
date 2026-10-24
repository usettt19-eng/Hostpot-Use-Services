import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { ensureParentFirst, ensureParentQueue, hasSharing, removeStaleFixedQueues, syncBandwidthProfile, upsertFixedQueue, upsertPoolQueue, type RouterConfig } from "@/lib/mikrotik";
import { FIXED_POOL, fixedQueueName, poolGuarantee, poolTarget, splitFixed } from "@/lib/queues";
import { selectPlans, tuningOf } from "@/lib/plans";

export type SharingResult = { profiles: number; profilesTotal: number; fixed: number; fixedWithoutIp: number; errors: string[] };

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
  const errors: string[] = []; // lo que el router rechazó, para mostrarlo al dueño
  for (const p of plans) {
    try {
      await syncBandwidthProfile(cfg, p.name, p.download_kbps, p.upload_kbps, tuningOf(p));
      profiles++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      console.error("applySharing perfil:", msg);
      errors.push(msg);
    }
  }

  const f = sharing ? await syncFixedQueues(tenantId, cfg) : { individual: 0, pool: 0, withoutIp: 0, errors: [] as string[] };
  errors.push(...f.errors);
  return { profiles, profilesTotal: plans.length, fixed: f.individual + f.pool, fixedWithoutIp: f.withoutIp, errors };
}

/** Garantía de un equipo fijo cuando no se indica otra. */
export const DEFAULT_FIXED_MIN_KBPS = 512;


/**
 * Deja las colas de los equipos fijos como corresponde: una propia para los que tienen tope, un grupo PCQ para el resto
 * con IP, y borra las que sobren. Se llama al aplicar el reparto y al registrar o quitar un equipo. Solo servidor.
 */
export async function syncFixedQueues(tenantId: string, cfg: RouterConfig): Promise<{ individual: number; pool: number; withoutIp: number; errors: string[] }> {
  const errors: string[] = [];
  if (!hasSharing(cfg)) return { individual: 0, pool: 0, withoutIp: 0, errors };
  const db = createAdminClient();
  const { data, error } = await db.from("fixed_devices")
    .select("mac, ip, max_down_kbps, max_up_kbps, min_kbps").eq("tenant_id", tenantId);
  if (error) return { individual: 0, pool: 0, withoutIp: 0, errors }; // migración 0014 sin aplicar
  const { individual, pool, withoutIp } = splitFixed(data ?? []);

  const keep = new Set<string>();
  let okIndividual = 0;
  for (const d of individual) {
    keep.add(fixedQueueName(d.mac));
    try {
      await upsertFixedQueue(cfg, {
        mac: d.mac, ip: d.ip, downKbps: d.max_down_kbps ?? 0, upKbps: d.max_up_kbps ?? 0, minKbps: d.min_kbps ?? DEFAULT_FIXED_MIN_KBPS,
      });
      okIndividual++;
    } catch (e) {
      console.error("syncFixedQueues individual:", e instanceof Error ? e.message : "error");
      errors.push(`Equipo ${d.mac}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  let okPool = 0;
  if (pool.length) {
    keep.add(FIXED_POOL);
    try {
      await upsertPoolQueue(cfg, { target: poolTarget(pool), guaranteeKbps: poolGuarantee(pool, DEFAULT_FIXED_MIN_KBPS, cfg.total_down_kbps ?? 0) });
      okPool = pool.length;
    } catch (e) {
      console.error("syncFixedQueues grupo:", e instanceof Error ? e.message : "error");
      errors.push(`Grupo de equipos fijos: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  await removeStaleFixedQueues(cfg, keep).catch((e) =>
    console.error("syncFixedQueues limpieza:", e instanceof Error ? e.message : "error"));
  return { individual: okIndividual, pool: okPool, withoutIp, errors };
}

/**
 * Mantiene `PORTAL-ROOT` de primera en el router de cada establecimiento con reparto configurado. Lo llama el cron cada minuto:
 * al reiniciar el router o el Hotspot, la cola general puede volver a quedar delante.
 */
export async function keepParentFirstAll(): Promise<{ checked: number; moved: number }> {
  const db = createAdminClient();
  const { data, error } = await db.from("tenant_router_credentials").select("tenant_id").not("total_down_kbps", "is", null);
  if (error) return { checked: 0, moved: 0 }; // migración 0014 sin aplicar
  let moved = 0;
  for (const r of data ?? []) {
    try {
      const cfg = await getRouterConfig(r.tenant_id as string);
      if (await ensureParentFirst(cfg)) moved++;
    } catch (e) {
      console.error("keepParentFirst:", e instanceof Error ? e.message : "error");
    }
  }
  return { checked: data?.length ?? 0, moved };
}
