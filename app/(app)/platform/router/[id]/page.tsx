import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import RouterSetupForm from "./form";
import ConnectionForm from "./connection";
import CapacityForm from "./capacity";
import { hasSharing } from "@/lib/mikrotik";
import { parseMode } from "@/lib/queues";

export const dynamic = "force-dynamic";

export default async function RouterSetupPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { data: t } = await createAdminClient().from("tenants").select("id, name, slug").eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: c } = await createAdminClient().from("tenant_router_credentials")
    .select("router_url, router_user, router_cert_fingerprint, router_password_enc").eq("tenant_id", id).maybeSingle();
  // Reparto del ancho de banda (migración 0014): si aún no está aplicada, el formulario sale vacío
  const cap = await createAdminClient().from("tenant_router_credentials")
    .select("total_down_kbps, total_up_kbps, hotspot_network, sharing_mode").eq("tenant_id", id).maybeSingle();
  const capData = cap.error ? null : cap.data;
  const downMbps = capData?.total_down_kbps ? capData.total_down_kbps / 1024 : null;
  const upMbps = capData?.total_up_kbps ? capData.total_up_kbps / 1024 : null;
  const active = hasSharing({ router_url: null, router_user: null, router_password: null, total_down_kbps: capData?.total_down_kbps, total_up_kbps: capData?.total_up_kbps, hotspot_network: capData?.hotspot_network });
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
        <h2>Reparto del ancho de banda</h2>
        <p className="muted">
          Cada cliente tiene su propio internet: aquí indicas cuánto contrató. El portal crea en el router una cola padre con ese total
          y reparte entre los roles (con su mínimo garantizado y ráfaga, que cada administrador ajusta en <strong>Ancho de banda</strong>)
          y los equipos fijos con IP, que entran a un grupo que se reparte por igual o con su propio límite.
          {active ? " Reparto activo." : " Sin estos datos el reparto no se aplica y todo sigue como antes."}
        </p>
        {cap.error && <p className="err">Falta aplicar la migración 0014 en Supabase para poder guardar estos datos.</p>}
        <CapacityForm tenantId={t.id} downMbps={downMbps} upMbps={upMbps} network={capData?.hotspot_network ?? "192.168.200.0/24"}
          mode={parseMode(capData?.sharing_mode)} connected={!!c?.router_url} />
      </div>
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
