import { headers } from "next/headers";
import PortalView from "@/components/portal/PortalView";
import { getPortalState, requireAdminTenant } from "@/lib/portal";
import { defaultSettings, pickLocale } from "@/lib/portal-settings";
import { moduleEnabled } from "@/lib/tenant-modules";

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
  const questions = (await moduleEnabled(ctx.tenantId, "guest_profile")) ? settings.questions : [];
  return (
    <PortalView
      questions={questions} slug={ctx.slug} settings={settings} locale={locale} termsVersion={row?.terms_version ?? 1}
      assetBase="/preview/portal/assets" langBase="/preview/portal" banner={banner}
    />
  );
}
