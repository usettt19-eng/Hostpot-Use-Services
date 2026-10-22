import { headers } from "next/headers";
import { getTenantBySlug } from "@/lib/portal";
import { buildLoginHtml } from "@/lib/hotspot-login-page";

/**
 * login.html listo para el Hotspot del establecimiento. Es público y no contiene secretos (solo el código del
 * establecimiento y la dirección del portal). Desde el router:
 *   /tool fetch url="https://<portal>/w/<código>/mikrotik-login.html" dst-path="flash/hotspot/login.html"
 */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return new Response("No encontrado", { status: 404 });
  const h = await headers();
  const host = h.get("host") ?? "";
  const html = /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? buildLoginHtml(`https://${host}`, tenant.slug) : null;
  if (!html) return new Response("No disponible", { status: 400 });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
