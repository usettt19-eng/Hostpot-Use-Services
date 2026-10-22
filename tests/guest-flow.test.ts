import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { connectGuest, type FlowDeps, type FlowInput, type RouterApi } from "../lib/guest-flow.ts";
import { defaultSettings } from "../lib/portal-settings.ts";

const MAC = "AA:BB:CC:DD:EE:FF";

function setup(over: { host?: Awaited<ReturnType<RouterApi["findHost"]>>; hostThrows?: boolean; createThrows?: boolean; noRouter?: boolean; counts?: [number, number] } = {}) {
  const calls: string[] = [];
  const consents: any[] = [];
  const sessions: any[] = [];
  const updates: any[] = [];
  const created: any[] = [];
  const host = "host" in over ? over.host : { mac: MAC, authorized: false, bypassed: false, server: "hotspot-test" };
  let n = 0;
  const router: RouterApi = {
    findHost: async () => { calls.push("findHost"); if (over.hostThrows) throw new Error("x"); return host ?? null; },
    ensureProfile: async () => { calls.push("ensureProfile"); },
    createGuestUser: async (u) => { calls.push("createGuestUser"); if (over.createThrows) throw new Error("x"); created.push(u); },
  };
  const deps: FlowDeps = {
    now: () => new Date("2026-10-22T12:00:00Z"),
    router: over.noRouter ? null : router,
    db: {
      countSessions: async (_t, _s, ip) => { calls.push("count"); return (over.counts ?? [0, 0])[ip ? 0 : 1]; },
      upsertGuest: async (_t, g) => { calls.push("upsertGuest"); assert.ok(!g.emailEnc.includes("@") || g.emailEnc.startsWith("enc:")); return { id: "g1" }; },
      insertConsents: async (rows) => { calls.push("consents"); consents.push(...rows); },
      insertSession: async (row) => { calls.push("insertSession"); sessions.push(row); return "s1"; },
      updateSession: async (id, patch) => { updates.push({ id, patch }); },
    },
    blindIndex: (scope, v) => createHash("sha256").update(`${scope}:${v}`).digest("hex"),
    encrypt: (v) => `enc:${v}`,
    randomHex: () => `a${++n}b2c3d4e`.slice(0, 10),
    randomPassword: () => "PASS1234word",
  };
  const settings = { ...defaultSettings("Café"), session_minutes: 90 };
  const input: FlowInput = {
    tenantId: "t1", settings, termsVersion: 3, termsText: "Términos",
    plan: { name: "Clientes", downloadKbps: 5120, uploadKbps: 2048 },
    form: { email: " Ana@Correo.com ", name: "Ana", phone: "", acceptTerms: true, acceptMarketing: true },
    hs: { mac: MAC, ip: "192.168.200.198", login: "http://192.168.200.1/login", orig: "http://neverssl.com/" },
    userAgent: "UA",
  };
  return { deps, input, calls, consents, sessions, updates, created };
}

test("camino feliz: crea invitado, consentimientos, sesión y usuario en el router", async () => {
  const s = setup();
  const r = await connectGuest(s.deps, s.input);
  assert.equal(r.ok, true);
  assert.ok("redirect" in r);
  const u = new URL((r as any).redirect);
  assert.equal(u.origin + u.pathname, "http://192.168.200.1/login");
  assert.match(u.searchParams.get("username")!, /^g_/);
  assert.equal(u.searchParams.get("password"), "PASS1234word");
  assert.equal(u.searchParams.get("dst"), "http://neverssl.com/");
  assert.deepEqual(s.calls, ["count", "count", "findHost", "upsertGuest", "consents", "insertSession", "ensureProfile", "createGuestUser"]);
  assert.equal(s.consents.find((c) => c.kind === "terms").text_version, 3);
  assert.equal(s.consents.find((c) => c.kind === "marketing").granted, true);
  assert.equal(s.created[0].limitUptime, "1h30m");
  assert.equal(s.created[0].profile, "Clientes");
  assert.equal(s.created[0].comment, "guest:s1");
  assert.ok(!JSON.stringify(s.sessions).includes("AA:BB"), "la MAC no se guarda en claro");
  assert.equal(s.sessions[0].mac_hmac, createHash("sha256").update("t1:AA:BB:CC:DD:EE:FF").digest("hex"));
});

test("sin datos del Hotspot es solo vista previa y no toca nada", async () => {
  const s = setup();
  s.input.hs = { mac: "", ip: "", login: "", orig: "" };
  assert.deepEqual(await connectGuest(s.deps, s.input), { ok: true, simulated: true });
  assert.deepEqual(s.calls, []);
});

test("rechaza datos del Hotspot manipulados sin llegar al router", async () => {
  for (const hs of [
    { mac: MAC, ip: "192.168.200.198", login: "http://evil.com/login", orig: "" },
    { mac: "no-mac", ip: "192.168.200.198", login: "http://192.168.200.1/login", orig: "" },
    { mac: MAC, ip: "1.2.3", login: "http://192.168.200.1/login", orig: "" },
    { mac: MAC, ip: "", login: "http://192.168.200.1/login", orig: "" },
  ]) {
    const s = setup(); s.input.hs = hs;
    const r = await connectGuest(s.deps, s.input);
    assert.equal(r.ok, false);
    assert.deepEqual(s.calls, []);
  }
});

test("validaciones del formulario", async () => {
  const cases: [string, (i: FlowInput) => void][] = [
    ["términos", (i) => { i.form.acceptTerms = false; }],
    ["correo", (i) => { i.form.email = "no-es-correo"; }],
    ["nombre obligatorio", (i) => { i.settings.fields.name = "required"; i.form.name = " "; }],
    ["teléfono obligatorio", (i) => { i.settings.fields.phone = "required"; i.form.phone = "12"; }],
    ["método correo inactivo", (i) => { i.settings.methods = ["phone"]; }],
  ];
  for (const [label, mutate] of cases) {
    const s = setup(); mutate(s.input);
    const r = await connectGuest(s.deps, s.input);
    assert.equal(r.ok, false, label);
    assert.ok(!s.calls.includes("upsertGuest"), label);
  }
});

test("sin router configurado no crea nada", async () => {
  const s = setup({ noRouter: true });
  const r = await connectGuest(s.deps, s.input);
  assert.equal(r.ok, false);
  assert.ok(!s.calls.includes("upsertGuest"));
});

test("límite de intentos por IP y por local", async () => {
  for (const counts of [[3, 0], [0, 60]] as [number, number][]) {
    const s = setup({ counts });
    const r = await connectGuest(s.deps, s.input);
    assert.equal(r.ok, false);
    assert.ok(!s.calls.includes("findHost"));
  }
});

test("el dispositivo debe existir en el router y coincidir la MAC", async () => {
  for (const host of [null, { mac: "11:22:33:44:55:66", authorized: false, bypassed: false, server: "x" }]) {
    const s = setup({ host });
    const r = await connectGuest(s.deps, s.input);
    assert.equal(r.ok, false);
    assert.ok(!s.calls.includes("upsertGuest"));
  }
  const s = setup({ hostThrows: true });
  assert.equal((await connectGuest(s.deps, s.input)).ok, false);
});

test("si ya está conectado no se crea otro usuario", async () => {
  const s = setup({ host: { mac: MAC, authorized: true, bypassed: false, server: "x" } });
  const r = await connectGuest(s.deps, s.input) as any;
  assert.equal(r.ok, true);
  assert.equal(r.redirect, "http://neverssl.com/");
  assert.ok(!s.calls.includes("upsertGuest") && !s.calls.includes("createGuestUser"));
});

test("si falla la creación en el router, la sesión queda como fallida", async () => {
  const s = setup({ createThrows: true });
  const r = await connectGuest(s.deps, s.input);
  assert.equal(r.ok, false);
  assert.deepEqual(s.updates, [{ id: "s1", patch: { status: "failed" } }]);
});

test("la URL de destino configurada por el local tiene prioridad", async () => {
  const s = setup(); s.input.settings.redirect_url = "https://minegocio.com/hola";
  const r = await connectGuest(s.deps, s.input) as any;
  assert.equal(new URL(r.redirect).searchParams.get("dst"), "https://minegocio.com/hola");
});

test("un destino original malicioso se descarta", async () => {
  const s = setup(); s.input.hs.orig = "javascript:alert(1)";
  const r = await connectGuest(s.deps, s.input) as any;
  assert.equal(new URL(r.redirect).searchParams.has("dst"), false);
});
