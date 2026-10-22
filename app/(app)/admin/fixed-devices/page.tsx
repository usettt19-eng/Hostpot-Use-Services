import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { requireAdminTenant } from "@/lib/portal";
import { isConfigured, listIpBindings } from "@/lib/mikrotik";
import { bindingStatus } from "@/lib/fixed-devices";
import { FixedDeviceForm } from "./form";
import { removeFixedDevice } from "@/app/fixed-device-actions";

export const dynamic = "force-dynamic";

export default async function FixedDevicesPage() {
  const ctx = await requireAdminTenant();
  const { data: rows } = await createAdminClient()
    .from("fixed_devices").select("id, mac, name, ip, location, reason, router_binding_id, created_at")
    .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false });

  // Comprueba en el router si cada excepción sigue aplicada
  const cfg = await getRouterConfig(ctx.tenantId);
  let routerIds: Set<string> | null = null;
  let routerError: string | null = null;
  if (isConfigured(cfg)) {
    try {
      routerIds = await listIpBindings(cfg);
    } catch {
      routerError = "No se pudo consultar el router: el estado puede no ser exacto";
    }
  }

  return (
    <>
      <div className="card">
        <h1>Equipos fijos</h1>
        <p className="muted">Equipos por cable que deben navegar sin iniciar sesión en el Hotspot.</p>
        {routerError && <p className="err">{routerError}</p>}
      </div>
      <FixedDeviceForm />
      <div className="card scroll">
        <h2>Registrados</h2>
        <table className="table">
          <thead><tr><th>Nombre</th><th>MAC</th><th>IP</th><th>Ubicación</th><th>Motivo</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(rows ?? []).length === 0 && <tr><td colSpan={7} className="muted">No hay equipos fijos registrados.</td></tr>}
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td><code>{r.mac}</code></td><td>{r.ip ?? "—"}</td>
                <td>{r.location ?? "—"}</td><td>{r.reason ?? "—"}</td>
                <td>{routerError ? "desconocido" : bindingStatus(r.router_binding_id, routerIds)}</td>
                <td>
                  <form action={removeFixedDevice}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="danger">Quitar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
