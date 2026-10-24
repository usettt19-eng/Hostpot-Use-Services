import test from "node:test";
import assert from "node:assert/strict";
import { buildRateLimit, fixedQueueName, guaranteeFit, mbpsToKbps, parseNetwork, validateCapacity } from "../lib/queues.ts";

test("sin mínimo ni ráfaga, el formato simple de siempre (subida/bajada)", () => {
  assert.equal(buildRateLimit({ downloadKbps: 20480, uploadKbps: 10240 }), "10240k/20480k");
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 0, burstKbps: 0 }), "2048k/5120k");
});

test("con mínimo y sin ráfaga, los campos de ráfaga repiten el máximo", () => {
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 750 }), "2048k/5120k 2048k/5120k 2048k/5120k 1s/1s 8 750k/750k");
});

test("con ráfaga: umbral de un octavo del máximo durante 8 s", () => {
  assert.equal(
    buildRateLimit({ downloadKbps: 20480, uploadKbps: 20480, minKbps: 750, burstKbps: 25000 }),
    "20480k/20480k 25000k/25000k 2560k/2560k 8s/8s 8 750k/750k",
  );
});

test("el mínimo se recorta al máximo de cada sentido y nunca hay valores inválidos", () => {
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 512, minKbps: 1536 }), "512k/5120k 512k/5120k 512k/5120k 1s/1s 8 512k/1536k");
  const s = buildRateLimit({ downloadKbps: 0, uploadKbps: -5, minKbps: 100 });
  assert.match(s, /^1k\/1k /);
  assert.doesNotMatch(s, /NaN|undefined|-/);
});

test("red del WiFi: privada, con máscara razonable", () => {
  assert.deepEqual(parseNetwork(" 192.168.200.0/24 "), { ok: true, value: "192.168.200.0/24" });
  for (const bad of ["192.168.200.0", "8.8.8.0/24", "192.168.300.0/24", "192.168.200.0/31", "192.168.200.0/4", "10.0.0.0/24; x", ""]) {
    assert.equal(parseNetwork(bad).ok, false, bad);
  }
});

test("capacidad contratada, conversión y cuánta garantía cabe", () => {
  assert.equal(validateCapacity({ downMbps: 50, upMbps: 50 }), null);
  assert.notEqual(validateCapacity({ downMbps: 0, upMbps: 50 }), null);
  assert.notEqual(validateCapacity({ downMbps: NaN, upMbps: 50 }), null);
  assert.equal(mbpsToKbps(1.5), 1536);
  assert.equal(guaranteeFit(51200, 750), 68);
  assert.equal(guaranteeFit(51200, 0), null);
  assert.equal(fixedQueueName("aa:bb:cc:dd:ee:ff"), "FIXED-AA:BB:CC:DD:EE:FF");
});
