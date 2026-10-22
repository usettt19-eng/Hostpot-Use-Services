import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { isPlatformAdmin } from "@/lib/platform";

/** Solo el dueño de la plataforma (correo en PLATFORM_ADMIN_EMAILS); a cualquier otro lo saca del panel. */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  if (!isPlatformAdmin(auth.user.email)) redirect("/dashboard");
  return auth.user;
}
