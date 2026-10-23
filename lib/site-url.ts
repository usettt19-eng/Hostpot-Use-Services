/** Dirección pública del portal: `SITE_URL` si está definida; si no, la que anuncia el proxy (x-forwarded-*) o el Host de la petición. */
export function siteOrigin(h: { get(name: string): string | null }, env: string | undefined = process.env.SITE_URL): string {
  const fixed = (env ?? "").trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
