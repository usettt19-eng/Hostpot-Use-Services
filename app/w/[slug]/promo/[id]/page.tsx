import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PromoCard from "@/components/portal/PromoCard";
import { getPublishedPortal, getTenantBySlug } from "@/lib/portal";
import { loadPublicPromotion, recordPromotionEvent } from "@/lib/promotions-db";
import { openPromoTicket } from "@/lib/promo-token";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { readableOn } from "@/lib/portal-theme";
import { allow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Campaña que ve el visitante ANTES de recibir internet (por eso el teléfono no cierra la ventana del portal). La conexión real
 * ocurre al pulsar un botón: /go abre el pedido cifrado, cuenta el clic y manda al login del Hotspot. Sin un pedido válido
 * (vencido o alterado) no hay nada que mostrar y se vuelve al portal.
 */
export default async function PromoPage({
  params, searchParams,
}: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const t = sp.t ?? "";
  const ticket = openPromoTicket(t, { encrypt: encryptSecret, decrypt: decryptSecret }, Date.now());
  const valid = !!ticket && ticket.tenantId === tenant.id && ticket.promoId === id;

  if (!valid) {
    return (
      <div style={{ minHeight: "100vh", padding: "32px 16px", background: "#eef0f4", display: "flex", alignItems: "center" }}>
        <PromoCard
          content={{ title: "Este enlace venció", body: "Vuelve al portal para conectarte.", cta_label: "", cta_url: "", image: null }}
          imageSrc={null} ctaHref={null} nextHref={`/w/${tenant.slug}`} nextLabel="Volver al portal"
        />
      </div>
    );
  }

  const promo = await loadPublicPromotion(tenant.id, id);
  const { settings } = await getPublishedPortal(tenant.id, tenant.name);
  if (promo) {
    // Una impresión por visitante y minuto como máximo (x-real-ip lo fija nginx)
    const ip = (await headers()).get("x-real-ip") ?? "desconocida";
    if (allow(`promo:${ip}:${id}`, 3, 60_000)) await recordPromotionEvent(tenant.id, promo.id, "impression");
  }

  const base = `/w/${tenant.slug}/promo/${id}`;
  const go = (to: "cta" | "next") => `${base}/go?${new URLSearchParams({ t, to })}`;
  return (
    <div style={{ minHeight: "100vh", padding: "32px 16px", background: "#eef0f4", display: "flex", alignItems: "center" }}>
      <div style={{ width: "100%" }}>
        {promo ? (
          <PromoCard
            content={promo.content}
            imageSrc={promo.content.image ? `${base}/image` : null}
            ctaHref={promo.content.cta_url ? go("cta") : null}
            nextHref={go("next")} nextLabel="Continuar a internet"
            primary={settings.colors.primary} onPrimary={readableOn(settings.colors.primary)}
          />
        ) : (
          // La campaña se pausó o venció mientras tanto: igual se le deja conectar
          <PromoCard
            content={{ title: "Listo para conectarte", body: "", cta_label: "", cta_url: "", image: null }}
            imageSrc={null} ctaHref={null} nextHref={go("next")} nextLabel="Continuar a internet"
          />
        )}
      </div>
    </div>
  );
}
