import test from "node:test";
import assert from "node:assert/strict";
import { buildStats, delta, localDay, quick } from "../lib/stats.ts";

// Panamá = UTC-5. "Ahora": martes 2026-10-20 12:00 local = 17:00 UTC.
const NOW = new Date("2026-10-20T17:00:00Z");
const s = (guest: string, iso: string, status = "ended", end?: string) => ({ guest_id: guest, started_at: iso, ended_at: end ?? null, status });
const g = (id: string, iso: string) => ({ id, first_seen_at: iso });

test("día local de Panamá: 02:00 UTC pertenece al día anterior", () => {
  assert.equal(localDay(Date.parse("2026-10-20T02:00:00Z")), localDay(Date.parse("2026-10-19T12:00:00Z")));
  assert.notEqual(localDay(Date.parse("2026-10-20T06:00:00Z")), localDay(Date.parse("2026-10-19T12:00:00Z")));
});

test("7 días: cubre 7 cubos, rellena vacíos y separa nuevos de recurrentes", () => {
  const guests = [g("a", "2026-10-20T15:00:00Z"), g("b", "2026-09-01T15:00:00Z")];
  const sessions = [
    s("a", "2026-10-20T15:00:00Z"), // hoy, nuevo
    s("b", "2026-10-20T16:00:00Z"), // hoy, recurrente
    s("b", "2026-10-20T16:30:00Z"), // segunda visita del mismo
    s("b", "2026-10-18T16:00:00Z", "active"),
    s("b", "2026-10-19T16:00:00Z", "failed"), // no cuenta
    s("b", "2026-10-10T16:00:00Z"),           // fuera del rango
  ];
  const st = buildStats(sessions, guests, NOW, 7, "day");
  assert.equal(st.buckets.length, 7);
  const today = st.buckets[6];
  assert.deepEqual([today.visits, today.unique, today.fresh, today.returning], [3, 2, 1, 1]);
  assert.equal(st.buckets[5].visits, 0); // el día de la sesión fallida
  assert.equal(st.current.visits, 4);
  assert.equal(st.current.unique, 2);
  assert.equal(st.current.fresh, 1);
  assert.equal(st.current.returning, 1);
});

test("distribución por hora y por día de la semana (hora local)", () => {
  const st = buildStats([s("a", "2026-10-20T17:00:00Z")], [g("a", "2026-10-20T17:00:00Z")], NOW, 7, "day");
  assert.equal(st.byHour[12], 1);       // 12:00 local
  assert.equal(st.byWeekday[1], 1);     // martes
  assert.equal(st.byWeekday.reduce((x, y) => x + y, 0), 1);
});

test("duración media solo con sesiones terminadas", () => {
  const sessions = [
    s("a", "2026-10-20T15:00:00Z", "ended", "2026-10-20T16:00:00Z"),
    s("a", "2026-10-20T15:00:00Z", "ended", "2026-10-20T15:30:00Z"),
    s("a", "2026-10-20T15:00:00Z", "active"),
  ];
  const st = buildStats(sessions, [], NOW, 7, "day");
  assert.equal(st.current.avgMinutes, 45);
  assert.equal(buildStats([], [], NOW, 7, "day").current.avgMinutes, null);
});

test("semanas empiezan en lunes; 90 días da cubos semanales", () => {
  const st = buildStats([s("a", "2026-10-20T15:00:00Z")], [], NOW, 90, "week");
  assert.ok(st.buckets.length >= 13 && st.buckets.length <= 14);
  const last = st.buckets[st.buckets.length - 1];
  assert.equal(last.label, "19 oct"); // lunes 19
  assert.equal(last.visits, 1);
});

test("12 meses: 12 cubos que terminan en el mes actual", () => {
  const st = buildStats([s("a", "2026-10-02T15:00:00Z"), s("a", "2025-12-15T15:00:00Z")], [], NOW, 365, "month");
  assert.equal(st.buckets.length, 12);
  assert.equal(st.buckets[11].label, "oct 26");
  assert.equal(st.buckets[0].label, "nov 25");
  assert.equal(st.buckets[11].visits, 1);
  assert.equal(st.buckets[1].visits, 1); // diciembre 2025
});

test("comparación con el periodo anterior", () => {
  const sessions = [s("a", "2026-10-20T15:00:00Z"), s("a", "2026-10-19T15:00:00Z"), s("a", "2026-10-10T15:00:00Z")];
  const q = quick(sessions, [], NOW, 7);
  assert.equal(q.current.visits, 2);
  assert.equal(q.previous.visits, 1);
  assert.equal(delta(2, 1), 100);
  assert.equal(delta(1, 2), -50);
  assert.equal(delta(5, 0), null);
});
