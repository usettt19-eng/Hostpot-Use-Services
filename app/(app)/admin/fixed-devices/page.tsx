import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { requireAdminTenant } from "@/lib/portal";
import { hasSharing, isConfigured, listIpBindings } from "@/lib/mikrotik";
import { bindingStatus } from "@/lib/fixed-devices";
import { FixedDeviceForm } from "./form";
import { removeFixedDevice } from "@/app/fixed-device-actions";

export const dynamic = "force-dynamic";

export default async function FixedDevicesPage() {
  const ctx = await requireAdminTenant();
  const db = createAdminClient();
  type Row = { id: string; mac: string; name: string; ip: string | null; location: string | null; reason: string | null; router_binding_id: string | null; max_down_kbps?: number | null; max_up_kbps?: number | null; min_kbps?: number | null };
  // Si la migración 0014 todavía no se aplicó, se leen sin los límites de velocidad
  const withSpeeds = await db.from("fixed_devices")
    .select("id, mac, name, ip, location, reason, router_binding_id, created_at, max_down_kbps, max_up_kbps, min_kbps")
    .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false });
  const rows: Row[] = withSpeeds.error
    ? (((await db.from("fixed_devices").select("id, mac, name, ip, location, reason, router_binding_id, created_at")
        .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false })).data ?? []) as Row[])
    : ((withSpeeds.data ?? []) as Row[]);

  // Comprueba en el router si cada excepción sigue aplicada
  const cfg = await getRouterConfig(ctx.tenantId);
  let routerIds: Set<string> | null = null;
  let routerError: string | null = null;
  const sharing = hasSharing(cfg);
  const speedText = (r: Row) => {
    if (!sharing) return "—";
    if (!r.ip) return "Sin IP: sin límite";
    if ((r.max_down_kbps ?? 0) > 0 || (r.max_up_kbps ?? 0) > 0) return `Propio: ↓${((r.max_down_kbps ?? 0) / 1024).toFixed(1)} / ↑${((r.max_up_kbps ?? 0) / 1024).toFixed(1)} Mbps`;
    return "Grupo (por igual)";
  };
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
        <p className="muted">Equipos por cable que deben navegar sin iniciar sesión en el Hotspot.{sharing ? " Con IP fija entran al reparto de velocidad: en el grupo que se reparte por igual, o con su propio límite." : ""}</p>
        {routerError && <p className="err">{routerError}</p>}
      </div>
      <FixedDeviceForm />
      <div className="card scroll">
        <h2>Registrados</h2>
        <table className="table">
          <thead><tr><th>Nombre</th><th>MAC</th><th>IP</th><th>Ubicación</th><th>Velocidad</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No hay equipos fijos registrados.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td><code>{r.mac}</code></td><td>{r.ip ?? "—"}</td>
                <td>{r.location ?? "—"}</td><td>{speedText(r)}</td>
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
