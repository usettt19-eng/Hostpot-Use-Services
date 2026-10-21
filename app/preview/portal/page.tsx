import { headers } from "next/headers";
import PortalView from "@/components/portal/PortalView";
import { getPortalState, requireAdminTenant } from "@/lib/portal";
import { defaultSettings, pickLocale } from "@/lib/portal-settings";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Vista previa del borrador para administradores (se muestra dentro del editor). */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const ctx = await requireAdminTenant();
  const { lang } = await searchParams;
  const { draft, published } = await getPortalState(ctx.tenantId, ctx.tenantName);
  const row = draft ?? published;
  const settings = row?.settings ?? defaultSettings(ctx.tenantName);
  const locale = pickLocale(lang, (await headers()).get("accept-language"), settings.default_locale);
  const banner = draft ? "BORRADOR sin publicar" : published ? "Versión publicada" : "Valores por defecto: aún no hay versión publicada";
  return (
    <PortalView
      settings={settings} locale={locale} termsVersion={row?.terms_version ?? 1}
      assetBase="/preview/portal/assets" langBase="/preview/portal" banner={banner}
    />
  );
}
