import test from "node:test";
import assert from "node:assert/strict";
import { buildLoginHtml } from "../lib/hotspot-login-page.ts";

test("la página redirige al portal con las variables del router", () => {
  const html = buildLoginHtml("https://connect.useservices.company", "use-test")!;
  assert.ok(html.includes('http-equiv="refresh"'));
  for (const v of ["$(mac-esc)", "$(ip)", "$(link-login-only-esc)", "$(link-orig-esc)", "$(error-esc)"]) {
    assert.ok(html.includes(v), v);
  }
  assert.ok(html.includes("url=https://connect.useservices.company/w/use-test?mac="));
  assert.ok(!html.includes("&ip=") && html.includes("&amp;ip="), "los & van escapados en el HTML");
});

test("rechaza códigos y direcciones que no sean seguros", () => {
  for (const bad of ["", "Use Test", "a/b", "../x", "x\"><script>", "UPPER", "-x", "a".repeat(81)]) {
    assert.equal(buildLoginHtml("https://connect.useservices.company", bad), null, bad);
  }
  for (const bad of ["http://connect.useservices.company", "javascript:alert(1)", "https://u:p@x.com", "no es url"]) {
    assert.equal(buildLoginHtml(bad, "use-test"), null, bad);
  }
});

test("la página no incluye nada ejecutable", () => {
  const html = buildLoginHtml("https://connect.useservices.company", "use-test")!;
  assert.ok(!/<script/i.test(html));
});
