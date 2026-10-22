import test from "node:test";
import assert from "node:assert/strict";
import { allow, resetRateLimits } from "../lib/rate-limit.ts";

test("permite hasta el límite y luego bloquea dentro de la ventana", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) assert.equal(allow("k", 3, 60_000, 1000 + i), true);
  assert.equal(allow("k", 3, 60_000, 1010), false);
  assert.equal(allow("k", 3, 60_000, 1020), false);
});

test("se libera al pasar la ventana", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) allow("k", 3, 1000, 0);
  assert.equal(allow("k", 3, 1000, 500), false);
  assert.equal(allow("k", 3, 1000, 1500), true);
});

test("las claves son independientes", () => {
  resetRateLimits();
  for (let i = 0; i < 5; i++) allow("a", 5, 60_000, 0);
  assert.equal(allow("a", 5, 60_000, 1), false);
  assert.equal(allow("b", 5, 60_000, 1), true);
});

test("los intentos bloqueados no extienden el bloqueo", () => {
  resetRateLimits();
  for (let i = 0; i < 2; i++) allow("k", 2, 1000, 0);
  for (let t = 100; t < 900; t += 100) assert.equal(allow("k", 2, 1000, t), false);
  assert.equal(allow("k", 2, 1000, 1001), true); // los dos primeros ya salieron de la ventana
});

test("la memoria no crece sin límite", () => {
  resetRateLimits();
  for (let i = 0; i < 12000; i++) allow(`k${i}`, 1, 1000, i * 2000);
  assert.equal(allow("nuevo", 1, 1000, 30_000_000), true);
});
