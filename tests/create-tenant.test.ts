import test from "node:test";
import assert from "node:assert/strict";
import { createTenantWithAdmin, slugify, type CreateTenantDeps } from "../lib/create-tenant.ts";

function fake(over: Partial<CreateTenantDeps> = {}) {
  const log: string[] = [];
  const deps: CreateTenantDeps = {
    async insertTenant(r) { log.push(`tenant:${r.slug}:${r.type}`); return { id: "t1" }; },
    async deleteTenant(id) { log.push(`del-tenant:${id}`); },
    async createAuthUser(e) { log.push(`user:${e}`); return { id: "u1" }; },
    async deleteAuthUser(id) { log.push(`del-user:${id}`); },
    async insertProfile() { log.push("profile"); return null; },
    ...over,
  };
  return { deps, log };
}
const input = { name: "Café Ñandú", type: "pub", fullName: "Ana", email: " Ana@X.com ", password: "12345678" };

test("slug sin tildes ni símbolos", () => assert.equal(slugify("  Café Ñandú #1 "), "cafe-nandu-1"));

test("camino feliz: crea establecimiento, cuenta y perfil", async () => {
  const { deps, log } = fake();
  const r = await createTenantWithAdmin(deps, input);
  assert.deepEqual(r, { ok: true, slug: "cafe-nandu", email: "ana@x.com", name: "Café Ñandú" });
  assert.deepEqual(log, ["tenant:cafe-nandu:pub", "user:ana@x.com", "profile"]);
});

test("valida antes de crear nada", async () => {
  for (const bad of [
    { ...input, name: "###" }, { ...input, type: "banco" }, { ...input, fullName: " " },
    { ...input, email: "no-es-correo" }, { ...input, password: "corta" },
  ]) {
    const { deps, log } = fake();
    const r = await createTenantWithAdmin(deps, bad);
    assert.equal(r.ok, false);
    assert.deepEqual(log, []);
  }
});

test("nombre repetido: mensaje claro y no crea cuenta", async () => {
  const { deps, log } = fake({ async insertTenant() { return { error: "dup", duplicate: true }; } });
  const r = await createTenantWithAdmin(deps, input);
  assert.deepEqual(r, { ok: false, error: "Ya existe un establecimiento con ese nombre" });
  assert.deepEqual(log, []);
});

test("si falla la cuenta (correo repetido) se borra el establecimiento", async () => {
  const { deps, log } = fake({ async createAuthUser() { return { error: "Correo ya registrado" }; } });
  const r = await createTenantWithAdmin(deps, input);
  assert.deepEqual(r, { ok: false, error: "Correo ya registrado" });
  assert.deepEqual(log, ["tenant:cafe-nandu:pub", "del-tenant:t1"]);
});

test("si falla el perfil se borran la cuenta y el establecimiento", async () => {
  const { deps, log } = fake({ async insertProfile() { return "boom"; } });
  const r = await createTenantWithAdmin(deps, input);
  assert.equal(r.ok, false);
  assert.deepEqual(log, ["tenant:cafe-nandu:pub", "user:ana@x.com", "del-user:u1", "del-tenant:t1"]);
});

test("la contraseña temporal marca la cuenta para cambiarla; la elegida por la persona no", async () => {
  const seen: unknown[] = [];
  const { deps } = fake({ async createAuthUser(_e, _p, opts) { seen.push(opts); return { id: "u1" }; } });
  await createTenantWithAdmin(deps, { ...input, temporaryPassword: true });
  await createTenantWithAdmin(deps, input);
  assert.deepEqual(seen, [{ mustChangePassword: true }, { mustChangePassword: false }]);
});
