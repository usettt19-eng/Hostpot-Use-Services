import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PortalView from "@/components/portal/PortalView";
import { getPublishedPortal, getTenantBySlug } from "@/lib/portal";
import { pickLocale } from "@/lib/portal-settings";
import { parseLoginUrl, sanitizeOrig } from "@/lib/guest-utils";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function GuestPortal({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string; mac?: string; ip?: string; login?: string; orig?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const lang = sp.lang;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const { settings, termsVersion } = await getPublishedPortal(tenant.id, tenant.name);
  const locale = pickLocale(lang, (await headers()).get("accept-language"), settings.default_locale);
  return (
    <PortalView
      staffLoginUrl={parseLoginUrl(sp.login ?? "") ?? undefined} staffDst={sanitizeOrig(sp.orig ?? "")}
      slug={tenant.slug} settings={settings} locale={locale} termsVersion={termsVersion}
      hs={{ mac: sp.mac ?? "", ip: sp.ip ?? "", login: sp.login ?? "", orig: sp.orig ?? "", err: sp.err }}
      assetBase={`/w/${tenant.slug}/assets`} langBase={`/w/${tenant.slug}`}
    />
  );
}
