import test from "node:test";
import assert from "node:assert/strict";
import { FAQ } from "../lib/faq.ts";

test("las preguntas frecuentes tienen estructura válida y no se repiten", () => {
  const ids = new Set<string>(), qs = new Set<string>();
  for (const g of FAQ) {
    assert.ok(g.id && g.title && g.items.length > 0, g.id);
    assert.ok(!ids.has(g.id), `grupo repetido: ${g.id}`);
    ids.add(g.id);
    for (const it of g.items) {
      assert.ok(it.q.trim() && it.a.length > 0 && it.a.every((p) => p.trim()), it.q);
      assert.ok(!qs.has(it.q), `pregunta repetida: ${it.q}`);
      qs.add(it.q);
      assert.equal((it.a.join("").match(/\*\*/g) ?? []).length % 2, 0, `negritas sin cerrar: ${it.q}`);
    }
  }
});

test("nombra las pantallas con los nombres actuales del menú", () => {
  const all = JSON.stringify(FAQ);
  for (const name of ["Diseño y horarios", "Ancho de banda", "Equipos fijos", "Conectados", "Historial", "Estadísticas", "Visitantes"]) assert.ok(all.includes(name), name);
  assert.ok(!all.includes("menú «Portal»"));
});
