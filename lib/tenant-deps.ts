import { createAdminClient } from "@/lib/supabase";
import type { CreateTenantDeps } from "@/lib/create-tenant";

/** Dependencias reales (service role) para crear un establecimiento. Solo servidor. */
export function tenantDeps(): CreateTenantDeps {
  const db = createAdminClient();
  return {
    async insertTenant(row) {
      const { data, error } = await db.from("tenants").insert(row).select("id").single();
      if (error || !data) return { error: error?.message ?? "No se pudo crear el establecimiento", duplicate: error?.code === "23505" };
      return { id: data.id };
    },
    async deleteTenant(id) { await db.from("tenants").delete().eq("id", id); },
    async createAuthUser(email, password, opts) {
      const { data, error } = await db.auth.admin.createUser({
        email, password, email_confirm: true,
        ...(opts?.mustChangePassword ? { user_metadata: { must_change_password: true } } : {}),
      });
      if (error || !data.user) return { error: error?.message ?? "No se pudo crear la cuenta" };
      return { id: data.user.id };
    },
    async deleteAuthUser(id) { await db.auth.admin.deleteUser(id); },
    async insertProfile(row) {
      const { error } = await db.from("profiles").insert({
        ...row, requested_role: "superadmin", role: "superadmin", status: "active",
      });
      return error ? error.message : null;
    },
  };
}

/** El alta pública solo se abre con ALLOW_PUBLIC_SCHOOL_REGISTRATION=1; por defecto la hace el dueño desde /platform. */
export const publicRegistrationOpen = () => process.env.ALLOW_PUBLIC_SCHOOL_REGISTRATION === "1";
