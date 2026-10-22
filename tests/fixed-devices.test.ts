import test from "node:test";
import assert from "node:assert/strict";
import { bindingStatus, parseFixedDevice } from "../lib/fixed-devices.ts";

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
