import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { setUserStatus, toggleHotspot, removeHotspot } from "@/app/actions";
import { ApproveForm } from "./approve-form";
import { rolesFor, ROLE_LABEL, isAdminRole } from "@/lib/roles";

const STATUS_LABEL: Record<string, string> = { pending: "Pendiente", active: "Activo", suspended: "Suspendido" };

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role, status, tenant_id").eq("id", auth.user!.id).single();
  if (!me || me.status !== "active" || !isAdminRole(me.role)) redirect("/dashboard");

  const { data: est } = await supabase.from("tenants").select("type").eq("id", me.tenant_id).single();
  const roles = rolesFor(est?.type ?? "school");

  const { data: people } = await supabase
    .from("profiles").select("id, full_name, role, requested_role, status, created_at").order("created_at", { ascending: false });
  const { data: hotspot } = await supabase.from("hotspot_users").select("id, profile_id, username, disabled");
  const byProfile = new Map((hotspot ?? []).map((h) => [h.profile_id, h]));

  return (
    <div className="card">
      <h1>Usuarios</h1>
      <div className="scroll">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Hotspot</th><th>Acciones</th></tr></thead>
          <tbody>
            {(people ?? []).map((p) => {
              const h = byProfile.get(p.id);
              return (
                <tr key={p.id}>
                  <td>{p.full_name}</td>
                  <td>
                    <form action={setUserStatus} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="status" value={p.status} />
                      <select name="role" defaultValue={p.role} disabled={p.role === "superadmin"} style={{ width: "auto" }}>
                        {p.role === "superadmin" && <option value="superadmin">{ROLE_LABEL.superadmin}</option>}
                        {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      {p.role !== "superadmin" && <button className="ghost">Guardar</button>}
                    </form>
                  </td>
                  <td><span className={`badge ${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
                  <td>{h ? <>{h.username}{h.disabled && " (off)"}</> : <span className="muted">—</span>}</td>
                  <td>
                    <div className="row">
                      {p.status === "pending" && (
                        <ApproveForm id={p.id} requestedRole={p.requested_role} roles={roles} />
                      )}
                      {p.status === "active" && p.role !== "superadmin" && (
                        <form action={setUserStatus}>
                          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="suspended" />
                          <button className="ghost">Suspender</button>
                        </form>
                      )}
                      {p.status === "suspended" && (
                        <form action={setUserStatus}>
                          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="active" />
                          <button className="ghost">Reactivar</button>
                        </form>
                      )}
                      {h && (
                        <>
                          <form action={toggleHotspot}>
                            <input type="hidden" name="id" value={h.id} />
                            <input type="hidden" name="disabled" value={String(!h.disabled)} />
                            <button className="ghost">{h.disabled ? "Habilitar WiFi" : "Deshabilitar WiFi"}</button>
                          </form>
                          <form action={removeHotspot}><input type="hidden" name="id" value={h.id} /><button className="danger">Quitar</button></form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
