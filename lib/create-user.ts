import { isValidEmail, normalizeEmail } from "./guest-utils.ts";
import { uniqueUsername } from "./usernames.ts";

// El administrador crea una cuenta directamente. Las dependencias se inyectan para probar cada camino de fallo.

export type Plan = { name: string; download_kbps: number; upload_kbps: number };

export type CreateUserDeps = {
  roles: readonly string[];
  findPlan(role: string): Promise<Plan | null>;
  takenUsernames(): Promise<Set<string>>;
  createAuthUser(email: string): Promise<{ id: string } | { error: string }>;
  deleteAuthUser(id: string): Promise<void>;
  insertProfile(row: { id: string; full_name: string; role: string }): Promise<string | null>; // null = bien
  deleteProfile(id: string): Promise<void>;
  router: {
    ensureProfile(plan: Plan): Promise<void>;
    createHotspotUser(username: string, password: string, profileName: string): Promise<void>;
    deleteHotspotUser(username: string): Promise<void>;
  };
  insertHotspotUser(row: { profile_id: string; username: string }): Promise<string | null>;
  randomPassword(): string;
};

export type CreateUserResult =
  | { ok: true; username: string; password: string; name: string }
  | { ok: false; error: string };

const fail = (error: string): CreateUserResult => ({ ok: false, error });

export async function createUserAccount(
  deps: CreateUserDeps,
  input: { fullName: string; email: string; role: string; hotspotPassword: string }
): Promise<CreateUserResult> {
  const fullName = input.fullName.trim().slice(0, 100);
  const email = normalizeEmail(input.email);
  if (!fullName) return fail("Escribe el nombre completo");
  if (!isValidEmail(email)) return fail("Escribe un correo válido");
  if (!deps.roles.includes(input.role)) return fail("Rol inválido para este tipo de establecimiento");
  const typed = input.hotspotPassword.trim();
  if (typed && typed.length < 6) return fail("La contraseña del WiFi debe tener al menos 6 caracteres");
  const password = typed || deps.randomPassword();

  const plan = await deps.findPlan(input.role);
  if (!plan) return fail("Este rol no tiene un plan de red configurado");
  const username = uniqueUsername(email, await deps.takenUsernames());

  const auth = await deps.createAuthUser(email);
  if ("error" in auth) return fail(auth.error);
  const id = auth.id;

  const pErr = await deps.insertProfile({ id, full_name: fullName, role: input.role });
  if (pErr) {
    await deps.deleteAuthUser(id);
    return fail("No se pudo crear el perfil");
  }

  try {
    await deps.router.ensureProfile(plan);
    await deps.router.createHotspotUser(username, password, plan.name);
  } catch {
    await deps.deleteProfile(id);
    await deps.deleteAuthUser(id);
    return fail("No se pudo crear el usuario en el router. No se creó la cuenta");
  }

  const hErr = await deps.insertHotspotUser({ profile_id: id, username });
  if (hErr) {
    await deps.router.deleteHotspotUser(username).catch(() => {});
    await deps.deleteProfile(id);
    await deps.deleteAuthUser(id);
    return fail("No se pudo guardar el usuario del WiFi. No se creó la cuenta");
  }
  return { ok: true, username, password, name: fullName };
}
