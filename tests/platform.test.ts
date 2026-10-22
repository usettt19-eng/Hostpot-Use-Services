import test from "node:test";
import assert from "node:assert/strict";
import { isPlatformAdmin, parseAdminEmails, summarizeTenants } from "../lib/platform.ts";

test("correos de administrador de plataforma: sin variable nadie lo es", () => {
  assert.equal(isPlatformAdmin("a@x.com", undefined), false);
  assert.equal(isPlatformAdmin("a@x.com", ""), false);
  assert.equal(isPlatformAdmin(null, "a@x.com"), false);
});

test("ignora mayúsculas y espacios, y no acepta coincidencias parciales", () => {
  assert.deepEqual(parseAdminEmails(" A@x.com , b@y.com ,, "), ["a@x.com", "b@y.com"]);
  assert.equal(isPlatformAdmin("A@X.com", "a@x.com,b@y.com"), true);
  assert.equal(isPlatformAdmin("b@y.com", "a@x.com,b@y.com"), true);
  assert.equal(isPlatformAdmin("x.com", "a@x.com"), false);
  assert.equal(isPlatformAdmin("a@x.com.evil", "a@x.com"), false);
});

test("resumen por establecimiento", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const tenants = [
    { id: "t1", name: "A", slug: "a", type: "school", created_at: "2026-01-01" },
    { id: "t2", name: "B", slug: "b", type: "pub", created_at: "2026-01-02" },
  ];
  const r = summarizeTenants(
    tenants,
    [{ tenant_id: "t1", status: "active" }, { tenant_id: "t1", status: "pending" }, { tenant_id: "t1", status: "suspended" }, { tenant_id: "t2", status: "active" }],
    [{ tenant_id: "t1" }, { tenant_id: "t1" }, { tenant_id: "t2" }],
    [
      { tenant_id: "t1", status: "ended", started_at: "2026-10-20T00:00:00Z" },
      { tenant_id: "t1", status: "failed", started_at: "2026-10-20T00:00:00Z" },
      { tenant_id: "t1", status: "ended", started_at: "2026-08-01T00:00:00Z" }, // hace más de 30 días
    ],
    [{ tenant_id: "t2", suspended_at: "2026-10-21", reason: "Falta de pago" }],
    new Set(["t1"]), now,
  );
  assert.deepEqual([r[0].users, r[0].pending, r[0].guests, r[0].connections30, r[0].routerConfigured, r[0].suspended], [1, 1, 2, 1, true, false]);
  assert.deepEqual([r[1].users, r[1].guests, r[1].connections30, r[1].routerConfigured, r[1].suspended, r[1].reason], [1, 1, 0, false, true, "Falta de pago"]);
});
