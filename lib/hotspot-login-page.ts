// Página login.html del Hotspot de MikroTik que redirige al portal del establecimiento.
// Las variables $(…) las sustituye el router al servirla.

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function buildLoginHtml(baseUrl: string, slug: string): string | null {
  if (!SLUG.test(slug)) return null;
  let origin: string;
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    origin = u.origin;
  } catch {
    return null;
  }
  // El slug y el origen ya están validados: no contienen caracteres que rompan el HTML ni la URL
  const target =
    `${origin}/w/${slug}?mac=$(mac-esc)&amp;ip=$(ip)&amp;login=$(link-login-only-esc)&amp;orig=$(link-orig-esc)&amp;err=$(error-esc)`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conectando…</title>
<meta http-equiv="refresh" content="0; url=${target}">
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;margin-top:20vh">
<p>Conectando…</p>
<p><a href="${target}">Continuar</a></p>
</body>
</html>
`;
}
