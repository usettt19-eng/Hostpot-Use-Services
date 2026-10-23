import test from "node:test";
import assert from "node:assert/strict";
import { siteOrigin } from "../lib/site-url.ts";

const headers = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test("SITE_URL manda, sin barra final", () => {
  assert.equal(siteOrigin(headers({ host: "interno:3000" }), "https://connect.useservices.company/"), "https://connect.useservices.company");
});
test("sin SITE_URL usa lo que anuncia el proxy", () => {
  assert.equal(siteOrigin(headers({ "x-forwarded-host": "connect.useservices.company", "x-forwarded-proto": "https", host: "interno:3000" }), ""), "https://connect.useservices.company");
});
test("sin proxy usa el Host y https", () => {
  assert.equal(siteOrigin(headers({ host: "portal.ejemplo.com" }), undefined), "https://portal.ejemplo.com");
});
