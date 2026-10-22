import { isValidEmail, normalizeEmail } from "./guest-utils.ts";
import { isEstablishmentType } from "./roles.ts";

// Alta de un establecimiento con su primer administrador. Las dependencias se inyectan para probar cada fallo y su deshacer.

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export type CreateTenantDeps = {
  insertTenant(row: { name: string; slug: string; type: string }): Promise<{ id: string } | { error: string; duplicate: boolean }>;
  deleteTenant(id: string): Promise<void>;
  createAuthUser(email: string, password: string): Promise<{ id: string } | { error: string }>;
  deleteAuthUser(id: string): Promise<void>;
  insertProfile(row: { id: string; tenant_id: string; full_name: string }): Promise<string | null>; // null = bien
};

export type CreateTenantResult =
  | { ok: true; slug: string; email: string; name: string }
  | { ok: false; error: string };

const fail = (error: string): CreateTenantResult => ({ ok: false, error });

export async function createTenantWithAdmin(
  deps: CreateTenantDeps,
  input: { name: string; type: string; fullName: string; email: string; password: string }
): Promise<CreateTenantResult> {
  const name = input.name.trim().slice(0, 100);
  const slug = slugify(name);
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim().slice(0, 100);
  if (!slug) return fail("Nombre de establecimiento inválido");
  if (!isEstablishmentType(input.type)) return fail("Tipo de establecimiento inválido");
  if (!fullName) return fail("Escribe el nombre del administrador");
  if (!isValidEmail(email)) return fail("Escribe un correo válido");
  if (input.password.length < 8) return fail("La contraseña debe tener al menos 8 caracteres");

  const t = await deps.insertTenant({ name, slug, type: input.type });
  if ("error" in t) return fail(t.duplicate ? "Ya existe un establecimiento con ese nombre" : t.error);

  const u = await deps.createAuthUser(email, input.password);
  if ("error" in u) {
    await deps.deleteTenant(t.id);
    return fail(u.error);
  }
  const err = await deps.insertProfile({ id: u.id, tenant_id: t.id, full_name: fullName });
  if (err) {
    await deps.deleteAuthUser(u.id);
    await deps.deleteTenant(t.id);
    return fail("No se pudo crear el perfil del administrador");
  }
  return { ok: true, slug, email, name };
}
