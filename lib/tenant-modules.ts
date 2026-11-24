import { createAdminClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { isModuleKey, moduleAppliesTo, type ModuleKey } from "@/lib/modules";

/**
 * Módulos activos de un establecimiento. Solo servidor (service role). Si la migración 0015 no está aplicada, ninguno. Un módulo que
 * no aplica a su tipo (p. ej. «Preguntas al visitante» en una escuela) cuenta como apagado aunque haya quedado activado.
 */
export async function enabledModules(tenantId: string): Promise<Set<ModuleKey>> {
  const db = createAdminClient();
  const { data, error } = await db.from("tenant_modules").select("module").eq("tenant_id", tenantId);
  if (error) return new Set();
  const keys = (data ?? []).map((r) => String(r.module)).filter(isModuleKey);
  if (!keys.length) return new Set();
  const { data: t } = await db.from("tenants").select("type").eq("id", tenantId).maybeSingle();
  const type = String(t?.type ?? "");
  return new Set(keys.filter((k) => moduleAppliesTo(k, type)));
}

export async function moduleEnabled(tenantId: string, key: ModuleKey): Promise<boolean> {
  return (await enabledModules(tenantId)).has(key);
}

/** Para las pantallas de un módulo: si no está activo para este establecimiento, vuelve al inicio. */
export async function requireModule(tenantId: string, key: ModuleKey) {
  if (!(await moduleEnabled(tenantId, key))) redirect("/dashboard");
}
