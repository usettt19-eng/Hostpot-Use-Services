import test from "node:test";
import assert from "node:assert/strict";
import { localClock, minutesOpenLeft, nextOpeningText, parseHHMM, validateWindows, type Window } from "../lib/schedule.ts";

// Horario de ejemplo: lunes a viernes 07:00–14:00 y 15:00–17:00
const W: Window[] = [1, 2, 3, 4, 5].flatMap((d) => [
  { weekday: d, start: 420, end: 840 },
  { weekday: d, start: 900, end: 1020 },
]);

// Panamá es UTC-5 todo el año: hora local + 5 = UTC.
// lunes 2026-10-19: 07:00 local = 12:00 UTC.
const utc = (iso: string) => new Date(iso);

test("hora local de Panamá (UTC-5 todo el año)", () => {
  assert.deepEqual(localClock(utc("2026-10-19T17:00:00Z")), { weekday: 1, minutes: 720 }); // lunes 12:00
  assert.deepEqual(localClock(utc("2026-10-19T02:30:00Z")), { weekday: 7, minutes: 1290 }); // domingo 21:30
  assert.deepEqual(localClock(utc("2026-10-19T04:59:00Z")), { weekday: 7, minutes: 1439 }); // domingo 23:59
});

test("ventana abierta: minutos que quedan", () => {
  assert.equal(minutesOpenLeft(W, utc("2026-10-19T17:00:00Z")), 120); // lunes 12:00 → quedan 2 h
  assert.equal(minutesOpenLeft(W, utc("2026-10-19T12:30:00Z")), 390); // lunes 07:30 → quedan 6 h 30 min
  assert.equal(minutesOpenLeft(W, utc("2026-10-19T20:30:00Z")), 90);  // lunes 15:30 → quedan 1 h 30 min
});

test("cerrado: antes de abrir, en la pausa, al cerrar y los fines de semana", () => {
  assert.equal(minutesOpenLeft(W, utc("2026-10-19T11:59:00Z")), null); // lunes 06:59
  assert.equal(minutesOpenLeft(W, utc("2026-10-19T19:30:00Z")), null); // lunes 14:30 (pausa)
  assert.equal(minutesOpenLeft(W, utc("2026-10-19T19:00:00Z")), null); // lunes 14:00 exacto: el cierre ya es cerrado
  assert.equal(minutesOpenLeft(W, utc("2026-10-24T17:00:00Z")), null); // sábado 12:00
});

test("próxima apertura", () => {
  assert.equal(nextOpeningText(W, utc("2026-10-19T19:30:00Z")), "hoy a las 15:00"); // lunes 14:30
  assert.equal(nextOpeningText(W, utc("2026-10-24T17:00:00Z")), "lunes a las 07:00"); // sábado 12:00
  assert.equal(nextOpeningText([], utc("2026-10-19T17:00:00Z")), null);
});

test("validación de ventanas", () => {
  assert.equal(validateWindows(W), null);
  assert.ok(validateWindows([{ weekday: 1, start: 600, end: 500 }]), "inicio después del fin");
  assert.ok(validateWindows([{ weekday: 8, start: 1, end: 2 }]), "día inválido");
  assert.ok(validateWindows([{ weekday: 1, start: 420, end: 840 }, { weekday: 1, start: 800, end: 900 }]), "se cruzan");
  assert.equal(validateWindows([{ weekday: 1, start: 420, end: 840 }, { weekday: 1, start: 840, end: 900 }]), null, "contiguas están bien");
});

test("parseo de horas", () => {
  assert.equal(parseHHMM("07:30"), 450);
  assert.equal(parseHHMM("24:00"), null);
  assert.equal(parseHHMM("7:30"), null);
  assert.equal(parseHHMM("12:60"), null);
});
