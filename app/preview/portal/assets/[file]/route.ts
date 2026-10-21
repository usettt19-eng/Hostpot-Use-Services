import { assetResponse, getPortalState, readAsset, requireAdminTenant } from "@/lib/portal";

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const ctx = await requireAdminTenant();
  const { file } = await params;
  const { draft, published } = await getPortalState(ctx.tenantId, ctx.tenantName);
  const s = (draft ?? published)?.settings.assets;
  if (!s || (file !== s.logo && file !== s.background)) return assetResponse(null);
  return assetResponse(await readAsset(ctx.tenantId, file));
}
