import test from "node:test";
import assert from "node:assert/strict";
import { generateWifiPassword, validateWifiPassword } from "../lib/wifi-password.ts";

test("la contraseña generada tiene el largo pedido y solo caracteres legibles", () => {
  const bytes = new Uint8Array(Array.from({ length: 10 }, (_, i) => i * 37 + 5));
  const p = generateWifiPassword(bytes);
  assert.equal(p.length, 10);
  assert.match(p, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  assert.equal(generateWifiPassword(bytes), p); // determinista con los mismos bytes
  assert.equal(generateWifiPassword(new Uint8Array(255).fill(255), 12).length, 12);
});

test("valida la contraseña escrita a mano", () => {
  assert.equal(validateWifiPassword("Clave12345"), null);
  assert.equal(validateWifiPassword("con espacios 1"), null);
  for (const bad of ["corta", "a".repeat(65), 'con"comillas', "barra\\inversa", "salto\nlinea"]) assert.notEqual(validateWifiPassword(bad), null, bad);
});
