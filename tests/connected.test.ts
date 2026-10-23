import test from "node:test";
import assert from "node:assert/strict";
import { classify, counts, isGuestUser } from "../lib/connected.ts";

const a = (user: string, address: string, mac = "AA:BB:CC:DD:EE:01") => ({ user, address, mac, uptime: "1m", bytes: 10, loginBy: "http-chap" });
const users = new Map([["ana", { name: "Ana Pérez", role: "staff" }], ["luis", { name: "Luis", role: "teacher" }]]);

test("clasifica usuarios del portal, visitantes y otros", () => {
  const r = classify([a("g_abc123", "192.168.200.20"), a("Ana", "192.168.200.11"), a("ana", "192.168.200.12"), a("srubend", "192.168.200.30")], users);
  assert.deepEqual(r.map((x) => [x.kind, x.name]), [["user", "Ana Pérez"], ["user", "Ana Pérez"], ["guest", null], ["other", null]]);
  assert.equal(r[0].role, "staff");
});

test("ordena por nombre y luego por IP; un usuario con dos dispositivos aparece dos veces", () => {
  const r = classify([a("luis", "192.168.200.5"), a("ana", "192.168.200.12"), a("ana", "192.168.200.11")], users);
  assert.deepEqual(r.map((x) => x.address), ["192.168.200.11", "192.168.200.12", "192.168.200.5"]);
});

test("cuenta personas y dispositivos por separado", () => {
  const r = classify([a("ana", "1"), a("ana", "2"), a("luis", "3"), a("g_x", "4"), a("g_y", "5"), a("otro", "6")], users);
  assert.deepEqual(counts(r), { devices: 6, users: 2, userDevices: 3, guests: 2, other: 1 });
});

test("g_ identifica visitantes", () => {
  assert.equal(isGuestUser("g_ab"), true);
  assert.equal(isGuestUser("ana_g"), false);
});
