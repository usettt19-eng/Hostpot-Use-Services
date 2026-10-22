"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { cutAllAccess, enableUsers } from "@/lib/mikrotik";

/** Suspende o reactiva un establecimiento: guarda el estado y corta o restablece el WiFi en su router. */
export async function setTenantSuspended(fd: FormData) {
  await requirePlatformAdmin();
  const id = String(fd.get("id") ?? "");
  const suspend = fd.get("suspend") === "1";
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 200) || null;
  const db = createAdminClient();
  const { data: t } = await db.from("tenants").select("id").eq("id", id).maybeSingle();
  if (!t) return;

  if (suspend) {
    await db.from("tenant_suspensions").upsert({ tenant_id: id, reason, suspended_at: new Date().toISOString() });
  } else {
    await db.from("tenant_suspensions").delete().eq("tenant_id", id);
  }

  // El router es mejor esfuerzo: si no responde, el estado ya quedó guardado y el portal deja de dar acceso nuevo
  try {
    const cfg = await getRouterConfig(id);
    if (suspend) {
      await cutAllAccess(cfg);
    } else {
      const { data: rows } = await db
        .from("hotspot_users").select("username, profiles!inner(status)").eq("tenant_id", id).eq("profiles.status", "active");
      await enableUsers(cfg, (rows ?? []).map((r) => r.username));
    }
  } catch (e) {
    console.error("setTenantSuspended router:", e instanceof Error ? e.message : "error");
  }
  revalidatePath("/platform");
}
