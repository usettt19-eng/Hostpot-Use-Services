import { requireAdminTenant } from "@/lib/portal";
import RouterSetupForm from "./form";

export const dynamic = "force-dynamic";

export default async function RouterSetupPage() {
  const { tenantName } = await requireAdminTenant();
  return (
    <div className="card">
      <h1>Configurar el router</h1>
      <p className="muted">
        Genera las instrucciones para dejar un MikroTik (RouterOS 7) listo como Hotspot de {tenantName}. Puedes copiarlas bloque por bloque
        en la terminal del router o descargar el archivo y subirlo al router. No se guarda nada de lo que escribas aquí.
      </p>
      <RouterSetupForm />
    </div>
  );
}
