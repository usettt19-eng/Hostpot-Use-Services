import test from "node:test";
import assert from "node:assert/strict";
import { baseUsername, uniqueUsername } from "../lib/usernames.ts";

test("base: parte local en minúsculas y sin símbolos raros", () => {
  assert.equal(baseUsername("Ana.Perez+x@Correo.com"), "ana.perezx");
  assert.equal(baseUsername("josé@correo.com"), "jos");
  assert.equal(baseUsername("@correo.com"), "usuario");
  assert.equal(baseUsername("a".repeat(40) + "@x.com").length, 20);
});

test("g_ queda reservado para los invitados temporales", () => {
  assert.equal(baseUsername("g_abc@x.com"), "pg_abc");
  assert.ok(!baseUsername("G_Hola@x.com").startsWith("g_"));
});

test("únicos: ana, ana2, ana3…", () => {
  assert.equal(uniqueUsername("ana@a.com", new Set()), "ana");
  assert.equal(uniqueUsername("ana@b.com", new Set(["ana"])), "ana2");
  assert.equal(uniqueUsername("ana@c.com", new Set(["ana", "ana2"])), "ana3");
  assert.equal(uniqueUsername("ana@c.com", new Set(["ana", "ana3"])), "ana2");
});

test("el sufijo no supera el largo máximo", () => {
  const long = "x".repeat(25) + "@a.com";
  const first = uniqueUsername(long, new Set());
  const second = uniqueUsername(long, new Set([first]));
  assert.equal(first.length, 20);
  assert.equal(second.length, 20);
  assert.notEqual(first, second);
  assert.ok(second.endsWith("2"));
});
