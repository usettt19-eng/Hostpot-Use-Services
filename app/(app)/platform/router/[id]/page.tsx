import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import RouterSetupForm from "./form";

export const dynamic = "force-dynamic";

export default async function RouterSetupPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { data: t } = await createAdminClient().from("tenants").select("id, name, slug").eq("id", id).maybeSingle();
  if (!t) notFound();
  return (
    <div className="card">
      <p><Link href="/platform">← Plataforma</Link></p>
      <h1>Configurar el router de {t.name}</h1>
      <p className="muted">
        Genera las instrucciones para dejar un MikroTik (RouterOS 7) listo como Hotspot de este establecimiento (código <strong>{t.slug}</strong>).
        Copia los bloques en la terminal del router o descarga el archivo y súbelo al router. No se guarda nada de lo que escribas aquí.
      </p>
      <RouterSetupForm tenantId={t.id} />
    </div>
  );
}
