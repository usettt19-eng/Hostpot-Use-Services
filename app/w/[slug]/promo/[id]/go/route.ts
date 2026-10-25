import { getTenantBySlug } from "@/lib/portal";
import { loadPublicPromotion, recordPromotionEvent } from "@/lib/promotions-db";
import { openPromoTicket } from "@/lib/promo-token";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { buildLoginRedirect } from "@/lib/guest-utils";
import { allow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Aquí ocurre la conexión real: abre el pedido cifrado (auténtico, vigente y de esta campaña), cuenta el clic si fue el botón de la
 * campaña y manda al login del Hotspot con la credencial de un solo uso. El destino final es el enlace guardado de la campaña
 * (https revalidado desde la base de datos) o el destino original del visitante; nunca viene de la URL en claro.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const url = new URL(req.url);
  const tenant = await getTenantBySlug(slug);
  const ticket = openPromoTicket(url.searchParams.get("t") ?? "", { encrypt: encryptSecret, decrypt: decryptSecret }, Date.now());
  if (!tenant || !ticket || ticket.tenantId !== tenant.id || ticket.promoId !== id) {
    return new Response("Este enlace venció. Vuelve al portal para conectarte.", { status: 410, headers: { "Cache-Control": "no-store" } });
  }
  const ip = req.headers.get("x-real-ip") ?? "desconocida";
  if (!allow(`promo-go:${ip}`, 20, 60_000)) return new Response("Demasiados intentos", { status: 429 });

  let dst = ticket.next;
  if (url.searchParams.get("to") === "cta") {
    const promo = await loadPublicPromotion(tenant.id, id);
    if (promo?.content.cta_url) {
      dst = promo.content.cta_url;
      if (allow(`promo-click:${ip}:${id}`, 3, 60_000)) await recordPromotionEvent(tenant.id, promo.id, "click");
    }
  }
  return new Response(null, {
    status: 302,
    headers: { Location: buildLoginRedirect(ticket.login, ticket.username, ticket.password, dst), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
