import test from "node:test";
import assert from "node:assert/strict";
import {
  csvCell, isIPv4, isMac, isValidEmail, normalizeEmail, normalizeMac, normalizePhone, parseLoginUrl, routerDuration, sanitizeOrig,
} from "../lib/guest-utils.ts";

test("correo: normaliza y valida", () => {
  assert.equal(normalizeEmail("  Ana@Correo.COM "), "ana@correo.com");
  for (const ok of ["ana@correo.com", "a.b+c@sub.dominio.pa"]) assert.equal(isValidEmail(ok), true, ok);
  for (const bad of ["", "ana", "ana@", "@correo.com", "ana@correo", "a b@correo.com", "a@b@c.com", "ana@correo.com,otro@x.com", "<x>@correo.com", `${"a".repeat(250)}@x.com`]) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});

test("MAC e IP", () => {
  assert.equal(normalizeMac(" aa-bb-cc-dd-ee-ff "), "AA:BB:CC:DD:EE:FF");
  assert.equal(isMac("AA:BB:CC:DD:EE:FF"), true);
  assert.equal(isMac("AA:BB:CC:DD:EE"), false);
  assert.equal(isMac("GG:BB:CC:DD:EE:FF"), false);
  assert.equal(isIPv4("192.168.200.198"), true);
  for (const bad of ["300.1.1.1", "1.2.3", "a.b.c.d", "1.2.3.4.5", "192.168.200.1/24", ""]) assert.equal(isIPv4(bad), false, bad);
});

test("la URL de login solo acepta IP privada y /login", () => {
  assert.equal(parseLoginUrl("http://192.168.200.1/login"), "http://192.168.200.1/login");
  assert.equal(parseLoginUrl("http://10.0.0.1:8080/login"), "http://10.0.0.1:8080/login");
  assert.equal(parseLoginUrl("http://172.20.1.1/login"), "http://172.20.1.1/login");
  for (const bad of [
    "http://evil.com/login", "https://8.8.8.8/login", "http://172.32.0.1/login", "http://192.168.1.1/other",
    "http://192.168.1.1/login?x=1", "http://u:p@192.168.1.1/login", "javascript:alert(1)", "//192.168.1.1/login",
    "http://192.168.1.1.evil.com/login", "http://[::1]/login", "", "no es url",
  ]) assert.equal(parseLoginUrl(bad), null, bad);
});

test("el destino original se limpia", () => {
  assert.equal(sanitizeOrig("http://neverssl.com/"), "http://neverssl.com/");
  assert.equal(sanitizeOrig("javascript:alert(1)"), "");
  assert.equal(sanitizeOrig("http://u:p@sitio.com/"), "");
  assert.equal(sanitizeOrig("x".repeat(600)), "");
  assert.equal(sanitizeOrig(""), "");
});

test("teléfono", () => {
  assert.equal(normalizePhone("+507 6123-4567"), "+50761234567");
  assert.equal(normalizePhone("6123 4567"), "61234567");
  assert.equal(normalizePhone("123"), "");
  assert.equal(normalizePhone("1".repeat(16)), "");
  assert.equal(normalizePhone("abc"), "");
});

test("duración en formato RouterOS", () => {
  assert.equal(routerDuration(45), "45m");
  assert.equal(routerDuration(60), "1h");
  assert.equal(routerDuration(90), "1h30m");
  assert.equal(routerDuration(120), "2h");
  assert.equal(routerDuration(1440), "24h");
  assert.equal(routerDuration(0), "1m");
});

test("CSV: escapa comillas y neutraliza fórmulas", () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  for (const f of ["+1", "-1", "@x", "\tx"]) assert.ok(csvCell(f).startsWith(`"'`), f);
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(5), '"5"');
});
