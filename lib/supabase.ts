import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdmin } from "@supabase/supabase-js";

import { decryptSecret } from "@/lib/crypto";
export async function createClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* llamado desde un Server Component: el middleware refresca la sesión */
          }
        },
      },
    }
  );
}

/** Cliente con service role. Úsalo solo en código de servidor y tras verificar permisos. */
export function createAdminClient() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Lee y descifra las credenciales del router. Solo servidor (service role). */
export async function getRouterConfig(tenantId: string) {
  const { data } = await createAdminClient()
    .from("tenant_router_credentials")
    .select("router_url, router_user, router_password_enc")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    router_url: data?.router_url ?? null,
    router_user: data?.router_user ?? null,
    router_password: data?.router_password_enc ? decryptSecret(data.router_password_enc) : null,
  };
}
