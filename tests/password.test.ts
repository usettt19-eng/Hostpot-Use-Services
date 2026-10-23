import test from "node:test";
import assert from "node:assert/strict";
import { validateNewPassword } from "../lib/password.ts";

test("acepta una contraseña razonable", () => {
  assert.equal(validateNewPassword("vieja-123", "Nueva-clave-2026", "Nueva-clave-2026"), null);
  assert.equal(validateNewPassword(null, "Nueva-clave-2026", "Nueva-clave-2026"), null);
});

test("rechaza corta, sin números o letras, repetida, larga y sin coincidencia", () => {
  const bad: [string | null, string, string][] = [
    ["x", "corta1", "corta1"],
    ["x", "soloLetrasLargas", "soloLetrasLargas"],
    ["x", "1234567890123", "1234567890123"],
    ["x", "aaaaaaaaaaaa", "aaaaaaaaaaaa"],
    ["x", "a1".repeat(40), "a1".repeat(40)],
    ["x", "Nueva-clave-2026", "Nueva-clave-2027"],
    ["Nueva-clave-2026", "Nueva-clave-2026", "Nueva-clave-2026"],
    ["", "Nueva-clave-2026", "Nueva-clave-2026"],
  ];
  for (const [c, n, f] of bad) assert.notEqual(validateNewPassword(c, n, f), null, `${c}|${n}`);
});

test("en recuperación no se pide la contraseña actual ni se compara con ella", () => {
  assert.equal(validateNewPassword(null, "otra-clave-9999", "otra-clave-9999"), null);
});
