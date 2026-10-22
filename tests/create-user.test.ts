import test from "node:test";
import assert from "node:assert/strict";
import { createUserAccount, type CreateUserDeps } from "../lib/create-user.ts";

function setup(over: Partial<{ plan: any; taken: string[]; authError: string; profileError: string; routerThrows: boolean; hotspotError: string }> = {}) {
  const calls: string[] = [];
  const profiles: any[] = [];
  const created: any[] = [];
  const deps: CreateUserDeps = {
    roles: ["manager", "employee", "customer"],
    findPlan: async () => ("plan" in over ? over.plan : { name: "Empleados", download_kbps: 10240, upload_kbps: 5120 }),
    takenUsernames: async () => new Set(over.taken ?? []),
    createAuthUser: async () => { calls.push("auth"); return over.authError ? { error: over.authError } : { id: "u1" }; },
    deleteAuthUser: async (id) => { calls.push(`deleteAuth:${id}`); },
    insertProfile: async (row) => { calls.push("profile"); profiles.push(row); return over.profileError ?? null; },
    deleteProfile: async (id) => { calls.push(`deleteProfile:${id}`); },
    router: {
      ensureProfile: async () => { calls.push("ensureProfile"); },
      createHotspotUser: async (u, p, profile) => { calls.push("router"); if (over.routerThrows) throw new Error("x"); created.push({ u, p, profile }); },
      deleteHotspotUser: async (u) => { calls.push(`deleteRouter:${u}`); },
    },
    insertHotspotUser: async () => { calls.push("hotspot_users"); return over.hotspotError ?? null; },
    randomPassword: () => "PASSgen123",
  };
  return { deps, calls, profiles, created };
}
const input = { fullName: "Ana Pérez", email: " Ana@Correo.com ", role: "employee", hotspotPassword: "" };

test("camino feliz: cuenta, perfil, usuario del router y registro, en ese orden", async () => {
  const s = setup();
  const r = await createUserAccount(s.deps, input);
  assert.deepEqual(r, { ok: true, username: "ana", password: "PASSgen123", name: "Ana Pérez" });
  assert.deepEqual(s.calls, ["auth", "profile", "ensureProfile", "router", "hotspot_users"]);
  assert.deepEqual(s.created[0], { u: "ana", p: "PASSgen123", profile: "Empleados" });
  assert.equal(s.profiles[0].role, "employee");
});

test("usa la contraseña del WiFi que escribió el administrador", async () => {
  const s = setup();
  const r = await createUserAccount(s.deps, { ...input, hotspotPassword: " MiClave99 " }) as any;
  assert.equal(r.password, "MiClave99");
});

test("el nombre de usuario no choca con los existentes", async () => {
  const s = setup({ taken: ["ana", "ana2"] });
  const r = await createUserAccount(s.deps, input) as any;
  assert.equal(r.username, "ana3");
});

test("validaciones: no se crea nada", async () => {
  for (const bad of [
    { ...input, fullName: "  " }, { ...input, email: "no-es-correo" }, { ...input, role: "superadmin" },
    { ...input, role: "student" }, { ...input, hotspotPassword: "123" },
  ]) {
    const s = setup();
    const r = await createUserAccount(s.deps, bad);
    assert.equal(r.ok, false);
    assert.deepEqual(s.calls, []);
  }
});

test("rol sin plan de red: no se crea nada", async () => {
  const s = setup({ plan: null });
  assert.equal((await createUserAccount(s.deps, input)).ok, false);
  assert.deepEqual(s.calls, []);
});

test("correo ya registrado: error claro y nada más", async () => {
  const s = setup({ authError: "Ya existe una cuenta con ese correo" });
  const r = await createUserAccount(s.deps, input) as any;
  assert.equal(r.error, "Ya existe una cuenta con ese correo");
  assert.deepEqual(s.calls, ["auth"]);
});

test("falla el perfil: se borra la cuenta de acceso", async () => {
  const s = setup({ profileError: "boom" });
  assert.equal((await createUserAccount(s.deps, input)).ok, false);
  assert.deepEqual(s.calls, ["auth", "profile", "deleteAuth:u1"]);
});

test("falla el router: se deshacen perfil y cuenta, y no se guarda el usuario del WiFi", async () => {
  const s = setup({ routerThrows: true });
  const r = await createUserAccount(s.deps, input) as any;
  assert.equal(r.ok, false);
  assert.match(r.error, /router/);
  assert.deepEqual(s.calls, ["auth", "profile", "ensureProfile", "router", "deleteProfile:u1", "deleteAuth:u1"]);
});

test("falla guardar el usuario del WiFi: se borra del router y se deshace todo", async () => {
  const s = setup({ hotspotError: "boom" });
  const r = await createUserAccount(s.deps, input);
  assert.equal(r.ok, false);
  assert.deepEqual(s.calls, ["auth", "profile", "ensureProfile", "router", "hotspot_users", "deleteRouter:ana", "deleteProfile:u1", "deleteAuth:u1"]);
});
