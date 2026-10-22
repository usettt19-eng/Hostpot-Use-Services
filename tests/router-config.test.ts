import test from "node:test";
import assert from "node:assert/strict";
import { validateRouterInput } from "../lib/router-config.ts";

const fp = "AB".repeat(32);
const ok = { url: "https://10.99.0.3", user: "portal", password: "x", fingerprint: fp, hasPassword: false };

test("datos válidos se normalizan", () => {
  const r = validateRouterInput({ ...ok, url: " https://10.99.0.3:8443/ ", fingerprint: fp.match(/../g)!.join(":").toLowerCase() });
  assert.deepEqual(r, { ok: true, url: "https://10.99.0.3:8443", user: "portal", password: "x", fingerprint: fp });
});

test("sin contraseña nueva se conserva la guardada, pero la primera vez es obligatoria", () => {
  assert.equal(validateRouterInput({ ...ok, password: "", hasPassword: false }).ok, false);
  const r = validateRouterInput({ ...ok, password: "", hasPassword: true });
  assert.ok(r.ok && r.password === null);
});

test("rechaza URL no https, con credenciales, ruta o basura", () => {
  for (const url of ["http://10.99.0.3", "10.99.0.3", "https://u:p@10.99.0.3", "https://10.99.0.3/rest", "https://10.99.0.3?x=1", "ftp://x", "https://"]) {
    assert.equal(validateRouterInput({ ...ok, url }).ok, false, url);
  }
});

test("rechaza usuario y huella inválidos; la huella es opcional", () => {
  assert.equal(validateRouterInput({ ...ok, user: "a b" }).ok, false);
  assert.equal(validateRouterInput({ ...ok, user: "" }).ok, false);
  assert.equal(validateRouterInput({ ...ok, fingerprint: "109902" }).ok, false);
  const r = validateRouterInput({ ...ok, fingerprint: "" });
  assert.ok(r.ok && r.fingerprint === null);
});
