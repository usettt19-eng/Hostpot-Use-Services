import { assetResponse, getPublishedPortal, getTenantBySlug, readAsset } from "@/lib/portal";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return assetResponse(null);
  // Solo se sirven las imágenes de la versión publicada
  const { settings } = await getPublishedPortal(tenant.id, tenant.name);
  if (file !== settings.assets.logo && file !== settings.assets.background) return assetResponse(null);
  return assetResponse(await readAsset(tenant.id, file));
}
