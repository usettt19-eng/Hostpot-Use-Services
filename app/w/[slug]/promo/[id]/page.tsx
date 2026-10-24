import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PromoCard from "@/components/portal/PromoCard";
import { getPublishedPortal, getTenantBySlug } from "@/lib/portal";
import { loadPublicPromotion, recordPromotionEvent } from "@/lib/promotions-db";
import { sanitizeOrig } from "@/lib/guest-utils";
import { readableOn } from "@/lib/portal-theme";
import { allow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Página que ve el visitante justo después de conectarse. Sin campaña vigente, solo confirma la conexión y deja continuar. */
export default async function PromoPage({
  params, searchParams,
}: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ next?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  // Nunca se redirige solo a «next»: el visitante pulsa el enlace (así esta página no sirve para redirigir a sitios ajenos)
  const next = sanitizeOrig(sp.next ?? "");
  const promo = await loadPublicPromotion(tenant.id, id);
  const { settings } = await getPublishedPortal(tenant.id, tenant.name);

  if (promo) {
    // Una impresión por visitante y minuto como máximo (x-real-ip lo fija nginx)
    const ip = (await headers()).get("x-real-ip") ?? "desconocida";
    if (allow(`promo:${ip}:${id}`, 3, 60_000)) await recordPromotionEvent(tenant.id, promo.id, "impression");
  }

  const base = `/w/${tenant.slug}/promo/${id}`;
  return (
    <div style={{ minHeight: "100vh", padding: "32px 16px", background: "#eef0f4", display: "flex", alignItems: "center" }}>
      <div style={{ width: "100%" }}>
        {promo ? (
          <PromoCard
            content={promo.content}
            imageSrc={promo.content.image ? `${base}/image` : null}
            ctaHref={promo.content.cta_url ? `${base}/go` : null}
            nextHref={next || undefined}
            primary={settings.colors.primary} onPrimary={readableOn(settings.colors.primary)}
          />
        ) : (
          <PromoCard
            content={{ title: "Ya estás conectado", body: "Disfruta de tu conexión.", cta_label: "", cta_url: "", image: null }}
            imageSrc={null} ctaHref={null} nextHref={next || undefined}
          />
        )}
      </div>
    </div>
  );
}
