import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase";
import { siteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Destino del enlace del correo de recuperación. Canjea el código por una sesión, deja una marca de 15 minutos
 * y lleva a elegir la contraseña nueva. El destino es fijo (no se acepta ningún parámetro de redirección).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");
  const origin = siteOrigin(req.headers);
  const fail = () => NextResponse.redirect(`${origin}/forgot-password?error=1`);

  const supabase = await createClient();
  if (tokenHash && type === "recovery") {
    // Plantilla de correo con token_hash: funciona aunque el enlace se abra en otro navegador o dispositivo
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) return fail();
  } else if (code) {
    // Enlace estándar (PKCE): exige abrirlo en el mismo navegador donde se pidió
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
  } else {
    return fail();
  }

  const res = NextResponse.redirect(`${origin}/reset-password`);
  res.cookies.set("pw_reset", "1", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
