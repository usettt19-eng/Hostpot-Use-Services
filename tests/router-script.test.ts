import test from "node:test";
import assert from "node:assert/strict";
import { buildRouterScript, type RouterScriptInput } from "../lib/router-script.ts";

const base: RouterScriptInput = {
  slug: "cafe-a", portalHost: "connect.useservices.company", portalIp: "187.33.153.78",
  hotspotInterface: "ether3", network: "192.168.200.0/24", restPassword: "Clave-Segura.2026", wg: null,
};
const text = (r: ReturnType<typeof buildRouterScript>) => (r.ok ? r.blocks.map((b) => b.commands).join("\n") : "");

test("genera los bloques con los datos del establecimiento", () => {
  const r = buildRouterScript(base);
  assert.ok(r.ok);
  const t = text(r);
  assert.match(t, /\/ip address add address=192\.168\.200\.1\/24 interface=bridge-hotspot/);
  assert.match(t, /ranges=192\.168\.200\.10-192\.168\.200\.200/);
  assert.match(t, /url="https:\/\/connect\.useservices\.company\/w\/cafe-a\/mikrotik-login\.html"/);
  assert.match(t, /dst-address=187\.33\.153\.78 protocol=tcp dst-port=443/);
  assert.match(t, /\/user add name=portal group=portal password="Clave-Segura\.2026"/);
  assert.ok(!t.includes("wireguard"), "sin túnel no hay bloque de WireGuard");
});

test("sin IP del portal no abre el walled garden por IP", () => {
  assert.doesNotMatch(text(buildRouterScript({ ...base, portalIp: "" })), /walled-garden ip add/);
});

test("con túnel agrega WireGuard, limita www-ssl al servidor y numera los bloques", () => {
  const r = buildRouterScript({ ...base, wg: { serverPublicKey: "A".repeat(43) + "=", endpoint: "connect.useservices.company:51820", routerAddress: "10.99.0.3/24", serverAddress: "10.99.0.1" } });
  assert.ok(r.ok);
  const t = text(r);
  assert.match(t, /wireguard peers add .*endpoint-port=51820 allowed-address=10\.99\.0\.1\/32/);
  assert.match(t, /www-ssl certificate=portal-rest disabled=no address=10\.99\.0\.1\/32/);
  assert.deepEqual(r.blocks.map((b) => b.title[0]), ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.match(t, /src-address-list=visitantes dst-address-list=equipos-fijos action=drop/);
  assert.match(t, /chain=input src-address-list=visitantes protocol=tcp dst-port=21,22,23,443,8291,8728,8729 action=drop/);
  assert.match(t, /address-list add list=redes-privadas address=192\.168\.0\.0\/16/);
});

test("rechaza datos que podrían inyectar comandos o son inválidos", () => {
  const bad: Partial<RouterScriptInput>[] = [
    { slug: "a b" }, { slug: 'x"; /system reset-configuration; "' },
    { portalHost: "x.com\n/user remove admin" }, { portalIp: "999.1.1.1" },
    { hotspotInterface: "ether3; /user remove admin" }, { hotspotInterface: "3ether" },
    { network: "8.8.8.0/24" }, { network: "192.168.200.0/16" }, { network: "192.168.300.0/24" },
    { restPassword: "corta" }, { restPassword: 'una clave con "comillas"!' }, { restPassword: "a".repeat(12) + "\n/user remove admin" },
  ];
  for (const b of bad) assert.equal(buildRouterScript({ ...base, ...b }).ok, false, JSON.stringify(b));
  const wg = { serverPublicKey: "A".repeat(43) + "=", endpoint: "h.com:51820", routerAddress: "10.99.0.3/24", serverAddress: "10.99.0.1" };
  for (const w of [{ serverPublicKey: "corta" }, { endpoint: "h.com" }, { endpoint: "h.com:99999" }, { routerAddress: "8.8.8.8/24" }, { serverAddress: "1.1.1.1" }, { endpoint: 'h.com:1"; x' }]) {
    assert.equal(buildRouterScript({ ...base, wg: { ...wg, ...w } }).ok, false, JSON.stringify(w));
  }
});

test("el archivo .rsc incluye títulos como comentarios y todos los comandos", async () => {
  const { toRsc } = await import("../lib/router-script.ts");
  const r = buildRouterScript(base);
  assert.ok(r.ok);
  const f = toRsc(r.blocks, "Router de Cafe A");
  assert.match(f, /^# Router de Cafe A/);
  assert.match(f, /# ---- 1\. Acceso del portal al router/);
  assert.match(f, /\/ip hotspot add name=hotspot-portal/);
  assert.ok(!/\r/.test(f));
});
