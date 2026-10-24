import type { ProfileTuning } from "./mikrotik.ts";

export type PlanRow = {
  id?: string; role?: string; name: string; download_kbps: number; upload_kbps: number;
  max_devices: number; min_kbps?: number; burst_kbps?: number;
};

const BASE = "name, download_kbps, upload_kbps, max_devices";
const SHARING = `${BASE}, min_kbps, burst_kbps`;

type Result = { data: unknown[] | null; error: unknown };

/**
 * Lee perfiles de velocidad con mínimo y ráfaga. Si la migración 0014 todavía no está aplicada, la consulta falla y se
 * repite sin esas columnas: el resto del panel sigue funcionando.
 */
export async function selectPlans(build: (cols: string) => PromiseLike<Result>, extra = ""): Promise<PlanRow[]> {
  const pre = extra ? `${extra}, ` : "";
  const first = await build(pre + SHARING);
  if (!first.error) return (first.data ?? []) as PlanRow[];
  const second = await build(pre + BASE);
  return (second.data ?? []) as PlanRow[];
}

/** Dispositivos, mínimo y ráfaga de un perfil, listos para `syncBandwidthProfile`. */
export const tuningOf = (p: Pick<PlanRow, "max_devices" | "min_kbps" | "burst_kbps">): ProfileTuning => ({
  maxDevices: p.max_devices, minKbps: p.min_kbps ?? 0, burstKbps: p.burst_kbps ?? 0,
});
