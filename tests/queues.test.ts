import test from "node:test";
import assert from "node:assert/strict";
import { buildRateLimit, fixedQueueName, guaranteeFit, mbpsToKbps, parseMode, parseNetwork, poolGuarantee, poolTarget, splitFixed, validateCapacity } from "../lib/queues.ts";

test("sin mínimo ni ráfaga, el formato simple de siempre (subida/bajada)", () => {
  assert.equal(buildRateLimit({ downloadKbps: 20480, uploadKbps: 10240 }), "10240k/20480k");
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 0, burstKbps: 0 }), "2048k/5120k");
});

test("con mínimo y sin ráfaga, los campos de ráfaga van en cero (formato aceptado por RouterOS 7.12)", () => {
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 750 }), "2048k/5120k 0/0 0/0 0/0 8 750k/750k");
});

test("con ráfaga: umbral de un octavo del máximo durante 8 s", () => {
  assert.equal(
    buildRateLimit({ downloadKbps: 20480, uploadKbps: 20480, minKbps: 750, burstKbps: 25000 }),
    "20480k/20480k 25000k/25000k 2560k/2560k 8/8 8 750k/750k",
  );
});

test("el mínimo se recorta al máximo de cada sentido y nunca hay valores inválidos", () => {
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 512, minKbps: 1536 }), "512k/5120k 0/0 0/0 0/0 8 512k/1536k");
  const s = buildRateLimit({ downloadKbps: 0, uploadKbps: -5, minKbps: 100 });
  assert.match(s, /^1k\/1k /);
  assert.doesNotMatch(s, /NaN|undefined|-/);
  // Nunca una «s» en los tiempos (RouterOS 7.12 la rechaza) y una ráfaga por debajo del máximo se ignora
  for (const x of [s, buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 750 }), buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 750, burstKbps: 8000 })]) {
    assert.doesNotMatch(x, /\d+s\b/);
  }
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 750, burstKbps: 1000 }), "2048k/5120k 0/0 0/0 0/0 8 750k/750k"); // menor que ambos máximos: sin ráfaga
  // Mayor solo que el máximo de subida: la ráfaga aplica a ese sentido; en el otro queda igual al máximo
  assert.equal(buildRateLimit({ downloadKbps: 5120, uploadKbps: 2048, minKbps: 750, burstKbps: 3000 }), "2048k/5120k 3000k/5120k 256k/640k 8/8 8 750k/750k");
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

test("equipos fijos: con tope propio van aparte; el resto, al grupo; sin IP no hay cola", () => {
  const r = splitFixed([
    { mac: "A", ip: "192.168.200.201", max_down_kbps: 4096, max_up_kbps: 1024, min_kbps: 512 },
    { mac: "B", ip: "192.168.200.202", max_down_kbps: null, max_up_kbps: null, min_kbps: null },
    { mac: "C", ip: "192.168.200.203", max_down_kbps: 0, max_up_kbps: 0, min_kbps: 256 },
    { mac: "D", ip: null, max_down_kbps: 2048, max_up_kbps: 512, min_kbps: null },
  ]);
  assert.deepEqual(r.individual.map((d) => d.mac), ["A"]);
  assert.deepEqual(r.pool.map((d) => d.mac), ["B", "C"]);
  assert.equal(r.withoutIp, 1);
  assert.equal(poolTarget(r.pool), "192.168.200.202/32,192.168.200.203/32");
  assert.equal(poolGuarantee(r.pool, 512, 51200), 768); // 512 por defecto + 256 propio
  assert.equal(poolGuarantee(r.pool, 512, 1000), 250);   // tope: un cuarto del total
});

test("modo de reparto: solo «equal» activa el equitativo", () => {
  assert.equal(parseMode("equal"), "equal");
  for (const v of ["roles", "", null, undefined, "EQUAL", "x"]) assert.equal(parseMode(v), "roles");
});
