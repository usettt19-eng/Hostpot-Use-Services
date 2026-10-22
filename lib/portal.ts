import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase";
import { isAdminRole } from "@/lib/roles";
import { isTenantSuspended } from "@/lib/tenant-status";
import {
  ASSET_NAME_RE, IMAGE_MIME, defaultSettings, parseSettings, type PortalSettings,
} from "@/lib/portal-settings";

export const ASSET_BUCKET = "portal-assets";

export type PortalRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  settings: PortalSettings;
  terms_version: number;
  created_at: string;
  published_at: string | null;
};

/** Verifica que quien llama es un admin activo y devuelve su establecimiento. Redirige si no. */
export async function requireAdminTenant() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles").select("tenant_id, role, status").eq("id", auth.user.id).single();
  if (!me || me.status !== "active" || !isAdminRole(me.role)) redirect("/dashboard");
  if (await isTenantSuspended(me.tenant_id)) redirect("/dashboard");
  const { data: t } = await supabase.from("tenants").select("name, slug, type").eq("id", me.tenant_id).single();
  return {
    userId: auth.user.id,
    tenantId: me.tenant_id as string,
    tenantName: (t?.name ?? "") as string,
    slug: (t?.slug ?? "") as string,
    type: (t?.type ?? "school") as string,
  };
}

/** Ajustes guardados, revalidados al leer (defensa en profundidad); si no son válidos se descartan. */
function toRow(r: {
  id: string; version: number; status: string; settings: unknown; terms_version: number;
  created_at: string; published_at: string | null;
}, tenantName: string): PortalRow {
  const parsed = parseSettings(r.settings);
  return {
    id: r.id,
    version: r.version,
    status: r.status as PortalRow["status"],
    settings: parsed.ok ? parsed.data : defaultSettings(tenantName),
    terms_version: r.terms_version,
    created_at: r.created_at,
    published_at: r.published_at,
  };
}

const COLS = "id, version, status, settings, terms_version, created_at, published_at";

export async function getPortalState(tenantId: string, tenantName: string) {
  const { data } = await createAdminClient()
    .from("portal_versions").select(COLS).eq("tenant_id", tenantId)
    .order("version", { ascending: false }).limit(30);
  const rows = (data ?? []).map((r) => toRow(r, tenantName));
  return {
    draft: rows.find((r) => r.status === "draft") ?? null,
    published: rows.find((r) => r.status === "published") ?? null,
    history: rows.filter((r) => r.status !== "draft"),
  };
}

export async function getTenantBySlug(slug: string) {
  const { data } = await createAdminClient()
    .from("tenants").select("id, name, slug, type").eq("slug", slug.slice(0, 80)).maybeSingle();
  return data as { id: string; name: string; slug: string; type: string } | null;
}

/** Portal publicado del establecimiento, o los valores por defecto si todavía no publicó. */
export async function getPublishedPortal(tenantId: string, tenantName: string) {
  const { data } = await createAdminClient()
    .from("portal_versions").select(COLS).eq("tenant_id", tenantId).eq("status", "published").maybeSingle();
  if (!data) return { settings: defaultSettings(tenantName), termsVersion: 1, isDefault: true };
  const row = toRow(data, tenantName);
  return { settings: row.settings, termsVersion: row.terms_version, isDefault: false };
}

/** Lee una imagen del bucket privado. Solo nombres con la forma esperada. */
export async function readAsset(tenantId: string, file: string) {
  if (!ASSET_NAME_RE.test(file)) return null;
  const { data, error } = await createAdminClient().storage.from(ASSET_BUCKET).download(`${tenantId}/${file}`);
  if (error || !data) return null;
  const ext = file.split(".")[1] as keyof typeof IMAGE_MIME;
  return { bytes: await data.arrayBuffer(), type: IMAGE_MIME[ext] };
}

export function assetResponse(a: { bytes: ArrayBuffer; type: string } | null) {
  if (!a) return new Response("No encontrado", { status: 404 });
  return new Response(a.bytes, {
    headers: {
      "Content-Type": a.type,
      "X-Content-Type-Options": "nosniff",
      // el nombre es el hash del contenido: nunca cambia
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
