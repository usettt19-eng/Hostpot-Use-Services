"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import { ASSET_BUCKET, requireAdminTenant } from "@/lib/portal";
import { requireModule } from "@/lib/tenant-modules";
import { IMAGE_MIME, MAX_IMAGE_BYTES, sniffImage } from "@/lib/portal-settings";
import { STATUSES, panamaLocalToIso, parsePromotion } from "@/lib/promotions";
import { syncPromotionHosts } from "@/lib/promotions-db";

export type PromoState = { error?: string; ok?: string; id?: string } | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Admin activo del establecimiento con el módulo Promociones habilitado; si no, redirige. */
async function ctxWithModule() {
  const ctx = await requireAdminTenant();
  await requireModule(ctx.tenantId, "promotions");
  return ctx;
}

/** Crea o edita una campaña (queda como borrador al crearla). La imagen se verifica por contenido, igual que el logo del portal. */
export async function savePromotion(_: PromoState, fd: FormData): Promise<PromoState> {
  const ctx = await ctxWithModule();
  const id = str(fd, "id");
  if (id && !/^[0-9a-f-]{36}$/.test(id)) return { error: "Campaña no válida" };

  const starts = panamaLocalToIso(str(fd, "starts_at"));
  const ends = panamaLocalToIso(str(fd, "ends_at"));
  if (starts === undefined || ends === undefined) return { error: "Las fechas no son válidas" };

  let image: string | null = fd.get("remove_image") === "on" ? null : (str(fd, "image") || null);
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES.background) return { error: `La imagen supera ${MAX_IMAGE_BYTES.background / 1024} KB` };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImage(bytes);
    if (!type) return { error: "Solo se aceptan imágenes PNG, JPG o WebP válidas" };
    const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.${type}`;
    const { error: upErr } = await createAdminClient().storage
      .from(ASSET_BUCKET).upload(`${ctx.tenantId}/${name}`, bytes, { contentType: IMAGE_MIME[type], upsert: true });
    if (upErr) {
      console.error("savePromotion imagen:", upErr.message);
      return { error: "No se pudo subir la imagen" };
    }
    image = name;
  }

  const parsed = parsePromotion({
    name: str(fd, "name"), segment: str(fd, "segment"), inactive_days: Number(str(fd, "inactive_days") || 30),
    content: { title: str(fd, "title"), body: str(fd, "body"), cta_label: str(fd, "cta_label"), cta_url: str(fd, "cta_url"), image },
    starts_at: starts, ends_at: ends,
  });
  if (!parsed.ok) return { error: parsed.error };
  const row = { ...parsed.data, updated_at: new Date().toISOString() };

  const db = createAdminClient();
  if (id) {
    const { data, error } = await db.from("promotions").update(row).eq("id", id).eq("tenant_id", ctx.tenantId).select("id").maybeSingle();
    if (error || !data) return { error: "No se pudo guardar la campaña" };
    await syncPromotionHosts(ctx.tenantId);
    revalidatePath("/admin/promotions");
    return { ok: "Cambios guardados", id };
  }
  const { data, error } = await db.from("promotions")
    .insert({ ...row, tenant_id: ctx.tenantId, status: "draft", created_by: ctx.userId }).select("id").single();
  if (error || !data) {
    console.error("savePromotion:", error?.message);
    return { error: "No se pudo crear la campaña. ¿Está aplicada la migración 0016 en Supabase?" };
  }
  revalidatePath("/admin/promotions");
  return { ok: "Campaña creada como borrador. Actívala cuando esté lista", id: data.id };
}

/** Activa, pausa o vuelve a borrador una campaña. */
export async function setPromotionStatus(fd: FormData) {
  const ctx = await ctxWithModule();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(STATUSES as readonly string[]).includes(status)) return;
  await createAdminClient().from("promotions")
    .update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", ctx.tenantId);
  await syncPromotionHosts(ctx.tenantId);
  revalidatePath("/admin/promotions");
}

/** Borra una campaña y sus contadores. */
export async function deletePromotion(fd: FormData) {
  const ctx = await ctxWithModule();
  const id = str(fd, "id");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await createAdminClient().from("promotions").delete().eq("id", id).eq("tenant_id", ctx.tenantId);
  await syncPromotionHosts(ctx.tenantId);
  revalidatePath("/admin/promotions");
}
