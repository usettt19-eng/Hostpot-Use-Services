import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGuestUser, deleteHotspotUser, findHostByAddress, listActiveSessions, listGuestUsers, type RouterConfig,
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
      if (u.pathname === "/rest/ip/hotspot/host") {
        return res.end(JSON.stringify([{ ".id": "*1", address: "192.168.200.198", "mac-address": "aa:bb:cc:dd:ee:ff", authorized: "false", bypassed: "false", server: "hotspot-test" }]));
      }
      if (u.pathname === "/rest/ip/hotspot/active") return res.end(JSON.stringify([{ user: "g_abc", "bytes-in": "111", "bytes-out": "222" }, { user: "srubend" }]));
      if (u.pathname === "/rest/ip/hotspot/user" && req.method === "GET") {
        const name = u.searchParams.get("name");
        const all = [
          { ".id": "*A", name: "srubend", "bytes-in": "10", "bytes-out": "20", uptime: "1m" },
          { ".id": "*B", name: "g_abc", "bytes-in": "1000", "bytes-out": "2000", uptime: "5m" },
        ];
        return res.end(JSON.stringify(name ? all.filter((x) => x.name === name) : all));
      }
      if (u.pathname === "/rest/ip/hotspot/user" && req.method === "PUT") return res.end(JSON.stringify({ ".id": "*C" }));
      if (u.pathname.startsWith("/rest/ip/hotspot/user/") && req.method === "DELETE") { res.statusCode = 204; return res.end(); }
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
