"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { requireAdminTenant } from "@/lib/portal";
import { addBypassBinding, isConfigured, removeIpBinding } from "@/lib/mikrotik";
import { parseFixedDevice } from "@/lib/fixed-devices";

export type FixedState = { error?: string; ok?: string } | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Registra un equipo fijo: primero la excepción en el router, luego el registro. Si el registro falla, se deshace la excepción. */
export async function addFixedDevice(_: FixedState, fd: FormData): Promise<FixedState> {
  const ctx = await requireAdminTenant();
  const parsed = parseFixedDevice({
    mac: str(fd, "mac"), name: str(fd, "name"), ip: str(fd, "ip"), location: str(fd, "location"), reason: str(fd, "reason"),
  });
  if (!parsed.ok) return { error: parsed.error };
  const db = createAdminClient();

  const { data: dup } = await db.from("fixed_devices").select("id")
    .eq("tenant_id", ctx.tenantId).eq("mac", parsed.data.mac).maybeSingle();
  if (dup) return { error: "Ese equipo ya está registrado" };

  const cfg = await getRouterConfig(ctx.tenantId);
  let bindingId: string | null = null;
  if (isConfigured(cfg)) {
    try {
      bindingId = await addBypassBinding(cfg, parsed.data.mac, `fijo: ${parsed.data.name}`);
    } catch (e) {
      console.error("addFixedDevice router:", e instanceof Error ? e.message : "error");
      return { error: "No se pudo aplicar la excepción en el router. El equipo no quedó registrado" };
    }
  }

  const { error } = await db.from("fixed_devices").insert({
    tenant_id: ctx.tenantId, ...parsed.data, router_binding_id: bindingId, created_by: ctx.userId,
  });
  if (error) {
    if (bindingId) await removeIpBinding(cfg, bindingId).catch(() => {});
    console.error("addFixedDevice db:", error.message);
    return { error: "No se pudo guardar el equipo" };
  }
  revalidatePath("/admin/fixed-devices");
  return { ok: "Equipo registrado" };
}

/** Quita un equipo fijo: primero la excepción del router, luego el registro. */
export async function removeFixedDevice(fd: FormData) {
  const ctx = await requireAdminTenant();
  const id = str(fd, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const db = createAdminClient();
  const { data: row } = await db.from("fixed_devices").select("router_binding_id")
    .eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!row) return;
  const cfg = await getRouterConfig(ctx.tenantId);
  if (row.router_binding_id && isConfigured(cfg)) {
    await removeIpBinding(cfg, row.router_binding_id).catch((e) =>
      console.error("removeFixedDevice router:", e instanceof Error ? e.message : "error"));
  }
  await db.from("fixed_devices").delete().eq("id", id).eq("tenant_id", ctx.tenantId);
  revalidatePath("/admin/fixed-devices");
}
