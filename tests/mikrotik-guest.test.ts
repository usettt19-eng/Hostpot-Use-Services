import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listActiveDetails, setHotspotUserPassword, kickUserSessions, syncBandwidthProfile, ensureParentQueue, upsertFixedQueue, removeFixedQueue, addBypassBinding, createGuestUser, deleteHotspotUser, findHostByAddress, listActiveSessions, listGuestUsers,
  listHotspotUserNames, listIpBindings, removeIpBinding, type RouterConfig,
} from "../lib/mikrotik.ts";

// Router falso por HTTPS con certificado autofirmado: comprueba el uso de la API REST (no es un router real)
let server: https.Server;
let cfg: RouterConfig;
const seen: { method: string; url: string; auth?: string; body?: any }[] = [];

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "mt-"));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 2 -subj "/CN=127.0.0.1" 2>/dev/null`);
  const fp = execSync(`openssl x509 -in ${dir}/c.pem -noout -fingerprint -sha256`).toString().split("=")[1].trim();
  server = https.createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader("content-type", "application/json");
      const u = new URL(req.url!, "https://x");
      if (u.pathname === "/rest/ip/hotspot/user/profile" && req.method === "GET") {
        return res.end(JSON.stringify(u.searchParams.get("name") === "Existente" ? [{ ".id": "*P1", name: "Existente" }] : []));
      }
      if (u.pathname === "/rest/ip/hotspot/user/profile" && req.method === "PUT") return res.end(JSON.stringify({ ".id": "*P2" }));
      if (u.pathname === "/rest/ip/hotspot/user/profile/*P1" && req.method === "PATCH") return res.end(JSON.stringify({}));
      if (u.pathname === "/rest/queue/simple" && req.method === "GET") {
        const n = u.searchParams.get("name");
        return res.end(JSON.stringify(n === "PORTAL-ROOT" || n === "FIXED-AA:BB:CC:DD:EE:01" ? [{ ".id": "*Q1", name: n }] : []));
      }
      if (u.pathname === "/rest/queue/simple" && req.method === "PUT") return res.end(JSON.stringify({ ".id": "*Q9" }));
      if (u.pathname === "/rest/queue/simple/*Q1" && (req.method === "PATCH" || req.method === "DELETE")) { res.statusCode = req.method === "DELETE" ? 204 : 200; return res.end(req.method === "DELETE" ? undefined : "{}"); }
      if (u.pathname === "/rest/ip/hotspot/host") {
        return res.end(JSON.stringify([{ ".id": "*1", address: "192.168.200.198", "mac-address": "aa:bb:cc:dd:ee:ff", authorized: "false", bypassed: "false", server: "hotspot-test" }]));
      }
      if (u.pathname === "/rest/ip/hotspot/active") return res.end(JSON.stringify([{ ".id": "*S1", user: "g_abc", "bytes-in": "111", "bytes-out": "222" }, { ".id": "*S2", user: "srubend" }]));
      if (u.pathname === "/rest/ip/hotspot/user" && req.method === "GET") {
        const name = u.searchParams.get("name");
        const all = [
          { ".id": "*A", name: "srubend", "bytes-in": "10", "bytes-out": "20", uptime: "1m" },
          { ".id": "*B", name: "g_abc", "bytes-in": "1000", "bytes-out": "2000", uptime: "5m" },
        ];
        return res.end(JSON.stringify(name ? all.filter((x) => x.name === name) : all));
      }
      if (u.pathname === "/rest/ip/hotspot/user/*A" && req.method === "PATCH") return res.end(JSON.stringify({}));
      if (u.pathname.startsWith("/rest/ip/hotspot/active/") && req.method === "DELETE") { res.statusCode = 204; return res.end(); }
      if (u.pathname === "/rest/ip/hotspot/user" && req.method === "PUT") return res.end(JSON.stringify({ ".id": "*C" }));
      if (u.pathname.startsWith("/rest/ip/hotspot/user/") && req.method === "DELETE") { res.statusCode = 204; return res.end(); }
      if (u.pathname === "/rest/ip/hotspot/ip-binding" && req.method === "PUT") return res.end(JSON.stringify({ ".id": "*BIND1" }));
      if (u.pathname === "/rest/ip/hotspot/ip-binding" && req.method === "GET") return res.end(JSON.stringify([{ ".id": "*BIND1" }]));
      if (u.pathname === "/rest/ip/hotspot/ip-binding/*GONE" && req.method === "DELETE") { res.statusCode = 404; return res.end(JSON.stringify({ error: 404 })); }
      if (u.pathname.startsWith("/rest/ip/hotspot/ip-binding/") && req.method === "DELETE") { res.statusCode = 204; return res.end(); }
      res.statusCode = 404; res.end(JSON.stringify({ error: 404 }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  cfg = { router_url: `https://127.0.0.1:${port}`, router_user: "portal", router_password: "x", router_cert_fingerprint: fp };
});
after(() => server.close());

test("findHostByAddress devuelve la MAC en mayúsculas y el estado", async () => {
  const h = await findHostByAddress(cfg, "192.168.200.198");
  assert.deepEqual(h, { mac: "AA:BB:CC:DD:EE:FF", authorized: false, bypassed: false, server: "hotspot-test" });
  assert.equal(await findHostByAddress(cfg, "10.0.0.9"), null);
  const call = seen.find((s) => s.url.startsWith("/rest/ip/hotspot/host"))!;
  assert.match(call.auth!, /^Basic /);
});

test("createGuestUser envía los campos esperados", async () => {
  await createGuestUser(cfg, { name: "g_xyz", password: "pw", profile: "Clientes", limitUptime: "1h30m", comment: "guest:s1" });
  const put = seen.filter((s) => s.method === "PUT").at(-1)!;
  assert.deepEqual(put.body, { name: "g_xyz", password: "pw", profile: "Clientes", "limit-uptime": "1h30m", comment: "guest:s1" });
});

test("listGuestUsers solo devuelve los temporales y convierte los contadores", async () => {
  assert.deepEqual(await listGuestUsers(cfg), [{ name: "g_abc", bytesIn: 1000, bytesOut: 2000, uptime: "5m" }]);
});

test("listActiveSessions devuelve los contadores de la sesión en curso", async () => {
  const m = await listActiveSessions(cfg);
  assert.deepEqual([...m.keys()].sort(), ["g_abc", "srubend"]);
  assert.deepEqual(m.get("g_abc"), { bytesIn: 111, bytesOut: 222 });
  assert.deepEqual(m.get("srubend"), { bytesIn: 0, bytesOut: 0 });
});

test("deleteHotspotUser borra por identificador", async () => {
  await deleteHotspotUser(cfg, "g_abc");
  assert.ok(seen.some((s) => s.method === "DELETE" && s.url === "/rest/ip/hotspot/user/*B"));
});

test("con otra huella no se envía nada al router", async () => {
  const before = seen.length;
  await assert.rejects(findHostByAddress({ ...cfg, router_cert_fingerprint: "00".repeat(32) }, "192.168.200.198"), /huella/);
  assert.equal(seen.length, before);
});

test("excepciones de equipos fijos: alta, listado y baja", async () => {
  const id = await addBypassBinding(cfg, "AA:BB:CC:DD:EE:FF", "impresora");
  assert.equal(id, "*BIND1");
  const put = seen.filter((x) => x.method === "PUT" && x.url === "/rest/ip/hotspot/ip-binding").at(-1)!;
  assert.deepEqual(put.body, { "mac-address": "AA:BB:CC:DD:EE:FF", type: "bypassed", comment: "impresora" });
  assert.ok((await listIpBindings(cfg)).has("*BIND1"));
  await removeIpBinding(cfg, "*BIND1");
  assert.ok(seen.some((x) => x.method === "DELETE" && x.url === "/rest/ip/hotspot/ip-binding/*BIND1"));
});

test("borrar una excepción que ya no existe no es un error", async () => {
  await removeIpBinding(cfg, "*GONE");
});

test("nombres de usuarios del Hotspot, en minúsculas", async () => {
  assert.deepEqual([...(await listHotspotUserNames(cfg))].sort(), ["g_abc", "srubend"]);
});

test("syncBandwidthProfile envía rate-limit y shared-users (crear y actualizar)", async () => {
  await syncBandwidthProfile(cfg, "Personal", 10240, 5120, { maxDevices: 2 });
  const put = seen.filter((x) => x.method === "PUT" && x.url === "/rest/ip/hotspot/user/profile").pop()!;
  assert.deepEqual(put.body, { name: "Personal", "rate-limit": "5120k/10240k", "shared-users": "2" });
  await syncBandwidthProfile(cfg, "Existente", 2048, 1024);
  const patch = seen.filter((x) => x.method === "PATCH" && x.url === "/rest/ip/hotspot/user/profile/*P1").pop()!;
  assert.deepEqual(patch.body, { "rate-limit": "1024k/2048k", "shared-users": "1" });
  await syncBandwidthProfile(cfg, "Raro", 1000, 500, { maxDevices: 99 });
  assert.equal(seen.filter((x) => x.method === "PUT" && x.url === "/rest/ip/hotspot/user/profile").pop()!.body["shared-users"], "10");
});

test("listActiveDetails devuelve una fila por sesión con total de bytes", async () => {
  const r = await listActiveDetails(cfg);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { user: "g_abc", address: "", mac: "", uptime: "", bytes: 333, loginBy: "" });
  assert.equal(r[1].bytes, 0);
});

test("setHotspotUserPassword cambia la contraseña por id y falla si el usuario no existe", async () => {
  await setHotspotUserPassword(cfg, "srubend", "NuevaClave9");
  const patch = seen.filter((x) => x.method === "PATCH" && x.url === "/rest/ip/hotspot/user/*A").pop()!;
  assert.deepEqual(patch.body, { password: "NuevaClave9" });
  await assert.rejects(() => setHotspotUserPassword(cfg, "no_existe", "x12345"), /no existe/);
});

test("kickUserSessions cierra solo las sesiones de ese usuario", async () => {
  const before = seen.filter((x) => x.method === "DELETE" && x.url.startsWith("/rest/ip/hotspot/active/")).length;
  assert.equal(await kickUserSessions(cfg, "srubend"), 1);
  const dels = seen.filter((x) => x.method === "DELETE" && x.url.startsWith("/rest/ip/hotspot/active/"));
  assert.equal(dels.length - before, 1);
  assert.equal(dels.pop()!.url, "/rest/ip/hotspot/active/*S2");
  assert.equal(await kickUserSessions(cfg, "nadie"), 0);
});

test("con reparto configurado, el perfil cuelga de la cola padre y lleva mínimo y ráfaga", async () => {
  const shared = { ...cfg, total_down_kbps: 51200, total_up_kbps: 51200, hotspot_network: "192.168.200.0/24" };
  await syncBandwidthProfile(shared, "Personal", 10240, 5120, { maxDevices: 2, minKbps: 1536, burstKbps: 0 });
  const put = seen.filter((x) => x.method === "PUT" && x.url === "/rest/ip/hotspot/user/profile").pop()!;
  assert.deepEqual(put.body, {
    name: "Personal", "rate-limit": "5120k/10240k 5120k/10240k 5120k/10240k 1s/1s 8 1536k/1536k", "shared-users": "2", "parent-queue": "PORTAL-ROOT",
  });
  // sin reparto: nada de padre ni mínimo, aunque el perfil los tenga
  await syncBandwidthProfile(cfg, "Plano", 10240, 5120, { maxDevices: 1, minKbps: 1536 });
  const plain = seen.filter((x) => x.method === "PUT" && x.url === "/rest/ip/hotspot/user/profile").pop()!;
  assert.deepEqual(plain.body, { name: "Plano", "rate-limit": "5120k/10240k", "shared-users": "1" });
});

test("ensureParentQueue crea o actualiza PORTAL-ROOT con el internet contratado y exige la configuración", async () => {
  await assert.rejects(() => ensureParentQueue(cfg), /Falta configurar/);
  const shared = { ...cfg, total_down_kbps: 51200, total_up_kbps: 25600, hotspot_network: "192.168.200.0/24" };
  await ensureParentQueue(shared);
  const patch = seen.filter((x) => x.method === "PATCH" && x.url === "/rest/queue/simple/*Q1").pop()!;
  assert.equal(patch.body.target, "192.168.200.0/24");
  assert.equal(patch.body["max-limit"], "25600k/51200k");
});

test("equipos fijos: cola propia colgada del padre, con tope opcional y garantía; se puede quitar", async () => {
  const shared = { ...cfg, total_down_kbps: 51200, total_up_kbps: 51200, hotspot_network: "192.168.200.0/24" };
  await upsertFixedQueue(shared, { mac: "AA:BB:CC:DD:EE:02", ip: "192.168.200.201", downKbps: 4096, upKbps: 1024, minKbps: 512 });
  const put = seen.filter((x) => x.method === "PUT" && x.url === "/rest/queue/simple").pop()!;
  assert.deepEqual(put.body, {
    name: "FIXED-AA:BB:CC:DD:EE:02", target: "192.168.200.201/32", "max-limit": "1024k/4096k", "limit-at": "512k/512k", parent: "PORTAL-ROOT", comment: "Portal: equipo fijo",
  });
  await upsertFixedQueue(shared, { mac: "AA:BB:CC:DD:EE:03", ip: "192.168.200.202", downKbps: 0, upKbps: 0, minKbps: 512 });
  const open = seen.filter((x) => x.method === "PUT" && x.url === "/rest/queue/simple").pop()!;
  assert.equal(open.body["max-limit"], "0k/0k"); // sin tope propio
  assert.equal(open.body["limit-at"], "512k/512k");
  await upsertFixedQueue(shared, { mac: "AA:BB:CC:DD:EE:01", ip: "192.168.200.200", downKbps: 100, upKbps: 100, minKbps: 512 });
  const upd = seen.filter((x) => x.method === "PATCH" && x.url === "/rest/queue/simple/*Q1").pop()!;
  assert.equal(upd.body["limit-at"], "100k/100k"); // la garantía no supera el tope
  await removeFixedQueue(shared, "AA:BB:CC:DD:EE:01");
  assert.ok(seen.some((x) => x.method === "DELETE" && x.url === "/rest/queue/simple/*Q1"));
});
