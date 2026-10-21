import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PortalView from "@/components/portal/PortalView";
import { getPublishedPortal, getTenantBySlug } from "@/lib/portal";
import { pickLocale } from "@/lib/portal-settings";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function GuestPortal({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const { settings, termsVersion } = await getPublishedPortal(tenant.id, tenant.name);
  const locale = pickLocale(lang, (await headers()).get("accept-language"), settings.default_locale);
  return (
    <PortalView
      settings={settings} locale={locale} termsVersion={termsVersion}
      assetBase={`/w/${tenant.slug}/assets`} langBase={`/w/${tenant.slug}`}
    />
  );
}
