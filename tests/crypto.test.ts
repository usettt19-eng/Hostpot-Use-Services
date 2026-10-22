import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.ROUTER_CRED_KEY = randomBytes(32).toString("base64");
const { blindIndex, encryptSecret, decryptSecret } = await import("../lib/crypto.ts");

test("el índice ciego es estable, depende del establecimiento y no revela el dato", () => {
  const a = blindIndex("t1", "ana@correo.com");
  assert.equal(a, blindIndex("t1", "ana@correo.com"));
  assert.notEqual(a, blindIndex("t2", "ana@correo.com"));
  assert.notEqual(a, blindIndex("t1", "otra@correo.com"));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("ana"));
});

test("cifrado de ida y vuelta, distinto cada vez", () => {
  const e1 = encryptSecret("ana@correo.com");
  assert.notEqual(e1, encryptSecret("ana@correo.com"));
  assert.equal(decryptSecret(e1), "ana@correo.com");
  assert.ok(!e1.includes("ana"));
});

test("un texto cifrado alterado no se descifra", () => {
  const [iv, tag, enc] = encryptSecret("secreto").split(".");
  const bad = Buffer.from(enc, "base64"); bad[0] ^= 1;
  assert.throws(() => decryptSecret([iv, tag, bad.toString("base64")].join(".")));
});
