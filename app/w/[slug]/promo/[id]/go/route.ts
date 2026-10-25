import { getTenantBySlug } from "@/lib/portal";
import { loadPublicPromotion, recordPromotionEvent } from "@/lib/promotions-db";
import { openPromoTicket } from "@/lib/promo-token";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { buildLoginRedirect } from "@/lib/guest-utils";
import { allow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Abre el pedido cifrado (auténtico, vigente y de esta campaña). `to=next` es la conexión real: manda al login del Hotspot con la
 * credencial de un solo uso y el destino original del visitante. `to=cta` cuenta el clic y lleva al enlace guardado de la campaña
 * (https revalidado desde la base de datos). Ningún destino viene de la URL en claro.
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

  // Botón de la campaña: cuenta el clic y abre el enlace TODAVÍA sin conectar (el sitio está en la lista blanca del router). No se conecta
  // aquí porque, al detectar internet, el teléfono cierra la ventana del portal y el visitante nunca llegaría a ver el enlace.
  // Al volver (atrás) sigue en la página de la campaña con «Continuar a internet».
  if (url.searchParams.get("to") === "cta") {
    const promo = await loadPublicPromotion(tenant.id, id);
    if (promo?.content.cta_url) {
      if (allow(`promo-click:${ip}:${id}`, 3, 60_000)) await recordPromotionEvent(tenant.id, promo.id, "click");
      return new Response(null, { status: 302, headers: { Location: promo.content.cta_url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
  }
  // «Continuar a internet»: conexión real, con la credencial de un solo uso
  return new Response(null, {
    status: 302,
    headers: { Location: buildLoginRedirect(ticket.login, ticket.username, ticket.password, ticket.next), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
