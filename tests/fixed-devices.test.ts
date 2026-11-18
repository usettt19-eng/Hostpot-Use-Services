import test from "node:test";
import assert from "node:assert/strict";
import { resolveFixedIp, bindingStatus, parseFixedDevice } from "../lib/fixed-devices.ts";

const base = { mac: "aa-bb-cc-dd-ee-ff", name: "Impresora recepción", ip: "", location: "Recepción", reason: "Imprime facturas" };

test("normaliza la MAC y acepta datos mínimos", () => {
  const r = parseFixedDevice(base);
  assert.ok(r.ok);
  assert.equal(r.data.mac, "AA:BB:CC:DD:EE:FF");
  assert.equal(r.data.ip, null);
});

test("rechaza MAC, IP y nombre inválidos", () => {
  assert.equal(parseFixedDevice({ ...base, mac: "AA:BB:CC" }).ok, false);
  assert.equal(parseFixedDevice({ ...base, mac: "GG:BB:CC:DD:EE:FF" }).ok, false);
  assert.equal(parseFixedDevice({ ...base, ip: "300.1.1.1" }).ok, false);
  assert.equal(parseFixedDevice({ ...base, name: "   " }).ok, false);
  assert.equal(parseFixedDevice({ ...base, name: "x".repeat(81) }).ok, false);
});

test("el estado frente al router", () => {
  assert.equal(bindingStatus("*1", null), "sin router");
  assert.equal(bindingStatus("*1", new Set(["*1"])), "aplicado");
  assert.equal(bindingStatus("*1", new Set(["*2"])), "no encontrado en el router");
  assert.equal(bindingStatus(null, new Set(["*1"])), "no encontrado en el router");
});

test("velocidades opcionales de un equipo fijo: Mbps a kbps, juntas", () => {
  const base = { mac: "aa:bb:cc:dd:ee:01", name: "Cámara", ip: "192.168.200.201", location: "", reason: "" };
  const ok = parseFixedDevice({ ...base, maxDownMbps: "4", maxUpMbps: "1,5", minMbps: "0.5" });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.data.max_down_kbps, ok.data.max_up_kbps, ok.data.min_kbps], [4096, 1536, 512]);
  const none = parseFixedDevice(base);
  assert.ok(none.ok);
  if (none.ok) assert.equal(Object.keys(none.data).some((k) => k.endsWith("_kbps")), false);
  assert.equal(parseFixedDevice({ ...base, ip: "", maxDownMbps: "4", maxUpMbps: "1" }).ok, true);  // sin IP: se busca en el router por la MAC
  assert.equal(parseFixedDevice({ ...base, maxDownMbps: "4" }).ok, false);                           // bajada sin subida
  for (const bad of ["0", "-3", "abc", "1e9"]) assert.equal(parseFixedDevice({ ...base, maxDownMbps: bad, maxUpMbps: bad }).ok, false, bad);
});

test("la IP que el router ve para la MAC manda sobre la escrita; si no la ve, vale la escrita", () => {
  const found = new Map([["AA:BB:CC:DD:EE:01", "192.168.200.47"]]);
  assert.equal(resolveFixedIp({ mac: "aa:bb:cc:dd:ee:01", ip: "192.168.200.40" }, found), "192.168.200.47", "la escrita quedó vieja");
  assert.equal(resolveFixedIp({ mac: "AA:BB:CC:DD:EE:01", ip: null }, found), "192.168.200.47");
  assert.equal(resolveFixedIp({ mac: "AA:BB:CC:DD:EE:02", ip: "192.168.200.60" }, found), "192.168.200.60", "apagado: la escrita");
  assert.equal(resolveFixedIp({ mac: "AA:BB:CC:DD:EE:02", ip: null }, found), null);
});
