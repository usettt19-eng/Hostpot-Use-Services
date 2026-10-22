import { createAdminClient } from "@/lib/supabase";

/** ¿El dueño de la plataforma suspendió este establecimiento? Solo servidor (service role). */
export async function isTenantSuspended(tenantId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("tenant_suspensions").select("tenant_id").eq("tenant_id", tenantId).maybeSingle();
  return !!data;
}
