import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, parseUptime, planStaffSync, summarizeHistory } from "../lib/staff-sync.ts";

const NOW = new Date("2026-10-23T15:00:00Z");
const users = new Map([["ana", { profileId: "p1" }], ["luis", { profileId: "p2" }]]);
const hash = (m: string) => `h(${m})`;
const act = (user: string, mac: string, uptime = "5m", address = "192.168.200.11") => ({ user, mac, uptime, address, bytes: 100 });

test("uptime de RouterOS a milisegundos", () => {
  assert.equal(parseUptime("5m"), 300_000);
  assert.equal(parseUptime("1h2m3s"), 3_723_000);
  assert.equal(parseUptime("1w2d"), 9 * 86_400_000);
  assert.equal(parseUptime(""), 0);
  assert.equal(parseUptime("basura"), 0);
});

test("abre una sesión nueva con el inicio calculado desde el uptime", () => {
  const p = planStaffSync([act("Ana", "AA:01", "1h")], [], users, NOW, hash);
  assert.equal(p.inserts.length, 1);
  assert.deepEqual([p.inserts[0].profile_id, p.inserts[0].username, p.inserts[0].mac_hash], ["p1", "ana", "h(AA:01)"]);
  assert.equal(p.inserts[0].started_at, "2026-10-23T14:00:00.000Z");
  assert.deepEqual([p.updates.length, p.closes.length], [0, 0]);
});

test("actualiza lo abierto y cierra lo que ya no está en el router", () => {
  const open = [{ id: "s1", username: "ana", mac_hash: "h(AA:01)" }, { id: "s2", username: "luis", mac_hash: "h(BB:02)" }];
  const p = planStaffSync([act("ana", "AA:01")], open, users, NOW, hash);
  assert.deepEqual(p.updates.map((u) => u.id), ["s1"]);
  assert.deepEqual(p.closes, [{ id: "s2", ended_at: NOW.toISOString() }]);
  assert.equal(p.inserts.length, 0);
});

test("dos dispositivos del mismo usuario son dos sesiones", () => {
  const p = planStaffSync([act("ana", "AA:01"), act("ana", "AA:02")], [], users, NOW, hash);
  assert.equal(p.inserts.length, 2);
});

test("ignora usuarios que no son del portal, visitantes y sesiones sin MAC; no duplica lecturas repetidas", () => {
  const p = planStaffSync([act("g_abc", "CC:01"), act("srubend", "CC:02"), act("ana", ""), act("ana", "AA:01"), act("ana", "AA:01")], [], users, NOW, hash);
  assert.equal(p.inserts.length, 1);
});

test("resumen por persona", () => {
  const rows = [
    { profile_id: "p1", mac_hash: "a", started_at: "2026-10-22T12:00:00Z", last_seen_at: "2026-10-22T14:00:00Z", ended_at: "2026-10-22T14:05:00Z", bytes: 1 },
    { profile_id: "p1", mac_hash: "b", started_at: "2026-10-23T12:00:00Z", last_seen_at: "2026-10-23T12:30:00Z", ended_at: null, bytes: 1 },
    { profile_id: "p2", mac_hash: "c", started_at: "2026-10-20T12:00:00Z", last_seen_at: "2026-10-20T12:10:00Z", ended_at: "2026-10-20T12:10:00Z", bytes: 1 },
  ];
  const s = summarizeHistory(rows);
  assert.deepEqual(s.map((x) => x.profileId), ["p1", "p2"]); // el más reciente primero
  assert.deepEqual([s[0].sessions, s[0].devices, s[0].days, s[0].online], [2, 2, 2, true]);
  assert.equal(s[0].totalMs, (2 * 60 + 5) * 60_000 + 30 * 60_000);
  assert.equal(s[1].online, false);
});

test("una sesión que cruza la medianoche local cuenta dos días", () => {
  // 23:00 y 01:00 hora de Panamá (04:00 y 06:00 UTC)
  const s = summarizeHistory([{ profile_id: "p1", mac_hash: "a", started_at: "2026-10-23T04:00:00Z", last_seen_at: "2026-10-23T06:00:00Z", ended_at: "2026-10-23T06:00:00Z", bytes: 0 }]);
  assert.equal(s[0].days, 2);
});

test("duración legible", () => {
  assert.equal(formatDuration(20_000), "menos de 1 min");
  assert.equal(formatDuration(45 * 60_000), "45 min");
  assert.equal(formatDuration(125 * 60_000), "2 h 5 min");
});
