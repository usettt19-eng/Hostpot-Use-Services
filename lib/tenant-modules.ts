import { createAdminClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { isModuleKey, type ModuleKey } from "@/lib/modules";

/** Módulos activos de un establecimiento. Solo servidor (service role). Si la migración 0015 no está aplicada, ninguno. */
export async function enabledModules(tenantId: string): Promise<Set<ModuleKey>> {
  const { data, error } = await createAdminClient().from("tenant_modules").select("module").eq("tenant_id", tenantId);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String(r.module)).filter(isModuleKey));
}

export async function moduleEnabled(tenantId: string, key: ModuleKey): Promise<boolean> {
  return (await enabledModules(tenantId)).has(key);
}

/** Para las pantallas de un módulo: si no está activo para este establecimiento, vuelve al inicio. */
export async function requireModule(tenantId: string, key: ModuleKey) {
  if (!(await moduleEnabled(tenantId, key))) redirect("/dashboard");
}
