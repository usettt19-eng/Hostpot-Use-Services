import { createAdminClient } from "@/lib/supabase";
import { moduleEnabled } from "@/lib/tenant-modules";
import { parseContent, type PromoContent } from "@/lib/promotions";

export type LoadedPromotion = { id: string; content: PromoContent };

/**
 * Campaña que se puede mostrar al público: el módulo está activo, pertenece al establecimiento, está activa y vigente y su
 * contenido sigue siendo válido. `anyStatus` solo para servir su imagen (la vista previa del panel muestra borradores).
 */
export async function loadPublicPromotion(tenantId: string, id: string, anyStatus = false): Promise<LoadedPromotion | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  if (!(await moduleEnabled(tenantId, "promotions"))) return null;
  const { data } = await createAdminClient().from("promotions")
    .select("id, status, starts_at, ends_at, content").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!data) return null;
  const now = Date.now();
  if (!anyStatus) {
    if (data.status !== "active") return null;
    if (data.starts_at && Date.parse(data.starts_at) > now) return null;
    if (data.ends_at && Date.parse(data.ends_at) <= now) return null;
  }
  const content = parseContent(data.content);
  return content ? { id: data.id, content } : null;
}

/** Cuenta una impresión o un clic. Nunca guarda datos de la persona. Si falla, no interrumpe al visitante. */
export async function recordPromotionEvent(tenantId: string, promotionId: string, kind: "impression" | "click") {
  const { error } = await createAdminClient().from("promotion_events").insert({ tenant_id: tenantId, promotion_id: promotionId, kind });
  if (error) console.error("recordPromotionEvent:", error.message);
}
