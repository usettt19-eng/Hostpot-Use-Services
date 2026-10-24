import { assetResponse, getTenantBySlug, readAsset } from "@/lib/portal";
import { loadPublicPromotion } from "@/lib/promotions-db";

/** Imagen de la campaña (verificada por contenido al subirla). Se sirve aunque la campaña sea borrador, para la vista previa del panel. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  const promo = tenant ? await loadPublicPromotion(tenant.id, id, true) : null;
  if (!tenant || !promo?.content.image) return assetResponse(null);
  return assetResponse(await readAsset(tenant.id, promo.content.image));
}
