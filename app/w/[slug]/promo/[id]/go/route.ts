import { getTenantBySlug } from "@/lib/portal";
import { loadPublicPromotion, recordPromotionEvent } from "@/lib/promotions-db";
import { allow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Cuenta el clic y lleva al enlace de la campaña (siempre https://, revalidado desde la base de datos; el destino no viene de la URL). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  const promo = tenant ? await loadPublicPromotion(tenant.id, id) : null;
  if (!tenant || !promo || !promo.content.cta_url) return new Response("No encontrado", { status: 404 });
  const ip = req.headers.get("x-real-ip") ?? "desconocida";
  if (allow(`promo-click:${ip}:${id}`, 3, 60_000)) await recordPromotionEvent(tenant.id, promo.id, "click");
  return new Response(null, { status: 302, headers: { Location: promo.content.cta_url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
