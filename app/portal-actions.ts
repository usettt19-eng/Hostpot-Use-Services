"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import { ASSET_BUCKET, getPortalState, requireAdminTenant } from "@/lib/portal";
import {
  MAX_IMAGE_BYTES, defaultSettings, parseSettings, publishProblems, sniffImage, type PortalSettings,
} from "@/lib/portal-settings";
import { FIELD_MODES, METHODS, type LOCALES } from "@/lib/portal-theme";

export type PortalState = { error?: string; ok?: string; warnings?: string[] } | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function settingsFromForm(fd: FormData, base: PortalSettings): unknown {
  const loc = (l: (typeof LOCALES)[number]) => ({
    title: str(fd, `${l}_title`), subtitle: str(fd, `${l}_subtitle`),
    button: str(fd, `${l}_button`), footer: str(fd, `${l}_footer`),
  });
  const mode = (k: string) => (FIELD_MODES as readonly string[]).includes(str(fd, k)) ? str(fd, k) : "off";
  return {
    template: str(fd, "template"),
    display_name: str(fd, "display_name"),
    default_locale: str(fd, "default_locale"),
    colors: {
      primary: str(fd, "color_primary"), accent: str(fd, "color_accent"),
      text: str(fd, "color_text"), background: str(fd, "color_background"),
    },
    radius: str(fd, "radius"),
    font: str(fd, "font"),
    texts: { es: loc("es"), en: loc("en") },
    methods: METHODS.filter((m) => fd.get(`method_${m}`) === "on"),
    fields: { name: mode("field_name"), email: mode("field_email"), phone: mode("field_phone") },
    session_minutes: Number(str(fd, "session_minutes") || 120),
    redirect_url: str(fd, "redirect_url").trim(),
    privacy_url: str(fd, "privacy_url").trim(),
    terms: { es: str(fd, "terms_es"), en: str(fd, "terms_en") },
    assets: base.assets, // las imágenes se cambian con su propio formulario
  };
}

/** Escribe el borrador (lo crea si no existe). Solo el servidor escribe esta tabla. */
async function writeDraft(tenantId: string, userId: string, settings: PortalSettings) {
  const db = createAdminClient();
  const { data: draft } = await db
    .from("portal_versions").select("id").eq("tenant_id", tenantId).eq("status", "draft").maybeSingle();
  if (draft) {
    const { error } = await db.from("portal_versions").update({ settings }).eq("id", draft.id);
    return error;
  }
  const { data: last } = await db
    .from("portal_versions").select("version").eq("tenant_id", tenantId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("portal_versions").insert({
    tenant_id: tenantId, version: (last?.version ?? 0) + 1, status: "draft", settings, created_by: userId,
  });
  return error;
}

async function baseSettings(tenantId: string, tenantName: string) {
  const s = await getPortalState(tenantId, tenantName);
  return (s.draft ?? s.published)?.settings ?? defaultSettings(tenantName);
}

export async function saveDraft(_: PortalState, fd: FormData): Promise<PortalState> {
  const ctx = await requireAdminTenant();
  const base = await baseSettings(ctx.tenantId, ctx.tenantName);
  const parsed = parseSettings(settingsFromForm(fd, base));
  if (!parsed.ok) return { error: parsed.errors.join(" · ") };
  const error = await writeDraft(ctx.tenantId, ctx.userId, parsed.data);
  if (error) {
    console.error("saveDraft:", error.message);
    return { error: "No se pudo guardar el borrador" };
  }
  revalidatePath("/admin/portal");
  return { ok: "Borrador guardado", warnings: publishProblems(parsed.data) };
}

export async function publishDraft(): Promise<PortalState> {
  const ctx = await requireAdminTenant();
  const { draft } = await getPortalState(ctx.tenantId, ctx.tenantName);
  if (!draft) return { error: "No hay borrador para publicar" };
  const problems = publishProblems(draft.settings);
  if (problems.length) return { error: problems.join(" · ") };
  const { error } = await createAdminClient().rpc("publish_portal_version", {
    p_tenant: ctx.tenantId, p_version: draft.version,
  });
  if (error) {
    console.error("publishDraft:", error.message);
    return { error: "No se pudo publicar" };
  }
  revalidatePath("/admin/portal");
  return { ok: `Versión ${draft.version} publicada` };
}

export async function discardDraft(): Promise<PortalState> {
  const ctx = await requireAdminTenant();
  await createAdminClient().from("portal_versions").delete().eq("tenant_id", ctx.tenantId).eq("status", "draft");
  revalidatePath("/admin/portal");
  return { ok: "Borrador descartado" };
}

/** Copia los ajustes de una versión anterior al borrador (no publica nada). */
export async function restoreVersion(_: PortalState, fd: FormData): Promise<PortalState> {
  const ctx = await requireAdminTenant();
  const version = Number(fd.get("version"));
  if (!Number.isInteger(version)) return { error: "Versión inválida" };
  const { history } = await getPortalState(ctx.tenantId, ctx.tenantName);
  const src = history.find((h) => h.version === version);
  if (!src) return { error: "Versión no encontrada" };
  const error = await writeDraft(ctx.tenantId, ctx.userId, src.settings);
  if (error) return { error: "No se pudo restaurar" };
  revalidatePath("/admin/portal");
  return { ok: `Versión ${version} copiada al borrador` };
}

export async function uploadPortalAsset(_: PortalState, fd: FormData): Promise<PortalState> {
  const ctx = await requireAdminTenant();
  const kind = str(fd, "kind");
  if (kind !== "logo" && kind !== "background") return { error: "Tipo de imagen inválido" };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige un archivo" };
  if (file.size > MAX_IMAGE_BYTES[kind]) {
    return { error: `La imagen supera ${MAX_IMAGE_BYTES[kind] / 1024} KB` };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { error: "Solo se aceptan imágenes PNG, JPG o WebP válidas" };

  const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.${type}`;
  const mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[type];
  const { error: upErr } = await createAdminClient().storage
    .from(ASSET_BUCKET).upload(`${ctx.tenantId}/${name}`, bytes, { contentType: mime, upsert: true });
  if (upErr) {
    console.error("uploadPortalAsset:", upErr.message);
    return { error: "No se pudo subir la imagen" };
  }
  const base = await baseSettings(ctx.tenantId, ctx.tenantName);
  const next = { ...base, assets: { ...base.assets, [kind]: name } };
  const error = await writeDraft(ctx.tenantId, ctx.userId, next);
  if (error) return { error: "La imagen se subió pero no se pudo guardar en el borrador" };
  revalidatePath("/admin/portal");
  return { ok: "Imagen añadida al borrador" };
}

export async function removePortalAsset(_: PortalState, fd: FormData): Promise<PortalState> {
  const ctx = await requireAdminTenant();
  const kind = str(fd, "kind");
  if (kind !== "logo" && kind !== "background") return { error: "Tipo de imagen inválido" };
  const base = await baseSettings(ctx.tenantId, ctx.tenantName);
  const error = await writeDraft(ctx.tenantId, ctx.userId, { ...base, assets: { ...base.assets, [kind]: null } });
  if (error) return { error: "No se pudo quitar la imagen" };
  revalidatePath("/admin/portal");
  return { ok: "Imagen quitada del borrador" };
}
