import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import RouterSetupForm from "./form";
import ConnectionForm from "./connection";

export const dynamic = "force-dynamic";

export default async function RouterSetupPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { data: t } = await createAdminClient().from("tenants").select("id, name, slug").eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: c } = await createAdminClient().from("tenant_router_credentials")
    .select("router_url, router_user, router_cert_fingerprint, router_password_enc").eq("tenant_id", id).maybeSingle();
  return (
    <div className="card">
      <p><Link href="/platform">← Plataforma</Link></p>
      <h1>Configurar el router de {t.name}</h1>
      <p className="muted">
        Genera las instrucciones para dejar un MikroTik (RouterOS 7) listo como Hotspot de este establecimiento (código <strong>{t.slug}</strong>).
        Copia los bloques en la terminal del router o descarga el archivo y súbelo al router. No se guarda nada de lo que escribas aquí.
      </p>
      <RouterSetupForm tenantId={t.id} />
      <div className="card">
        <h2>Conexión del portal con el router</h2>
        <p className="muted">
          Cuando el router ya esté configurado y el túnel activo, guarda aquí cómo se conecta el portal. Al guardar se prueba la conexión
          y se suben los perfiles de velocidad del establecimiento. La contraseña se guarda cifrada y no se vuelve a mostrar.
        </p>
        <ConnectionForm tenantId={t.id} url={c?.router_url ?? ""} user={c?.router_user ?? ""}
          fingerprint={c?.router_cert_fingerprint ?? ""} hasPassword={!!c?.router_password_enc} />
      </div>
    </div>
  );
}
