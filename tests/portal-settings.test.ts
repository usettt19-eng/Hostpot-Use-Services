import test from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, readableOn } from "../lib/portal-theme.ts";
import { defaultSettings, parseSettings, publishProblems, sniffImage, pickLocale } from "../lib/portal-settings.ts";

const valid = () => ({ ...defaultSettings("Café Central"), terms: { es: "Términos de prueba suficientemente largos.", en: "" } });

test("contraste WCAG conocido", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  assert.ok(contrastRatio("#777777", "#ffffff") < 4.5); // gris claro sobre blanco: no pasa AA
  assert.ok(contrastRatio("#595959", "#ffffff") >= 4.5);
  assert.equal(readableOn("#1d4ed8"), "#ffffff");
  assert.equal(readableOn("#ffff00"), "#000000");
});

test("los ajustes por defecto son válidos", () => {
  assert.equal(parseSettings(defaultSettings("Hotel Sol")).ok, true);
});

test("rechaza colores, plantillas y métodos inválidos", () => {
  const s = valid() as Record<string, any>;
  assert.equal(parseSettings({ ...s, colors: { ...s.colors, primary: "red" } }).ok, false);
  assert.equal(parseSettings({ ...s, colors: { ...s.colors, primary: "#12345" } }).ok, false);
  assert.equal(parseSettings({ ...s, template: "libre" }).ok, false);
  assert.equal(parseSettings({ ...s, methods: [] }).ok, false);
  assert.equal(parseSettings({ ...s, methods: ["email", "email"] }).ok, false);
  assert.equal(parseSettings({ ...s, font: "Comic Sans" }).ok, false);
});

test("las URLs deben ser https", () => {
  const s = valid() as Record<string, any>;
  for (const bad of ["javascript:alert(1)", "http://sitio.com", "data:text/html,x", "//sitio.com", "https://u:p@sitio.com", "sitio.com"]) {
    assert.equal(parseSettings({ ...s, redirect_url: bad }).ok, false, bad);
    assert.equal(parseSettings({ ...s, privacy_url: bad }).ok, false, bad);
  }
  assert.equal(parseSettings({ ...s, redirect_url: "https://sitio.com/bienvenida" }).ok, true);
  assert.equal(parseSettings({ ...s, redirect_url: "" }).ok, true);
});

test("límites de longitud y nombres de archivo", () => {
  const s = valid() as Record<string, any>;
  assert.equal(parseSettings({ ...s, display_name: "x".repeat(61) }).ok, false);
  assert.equal(parseSettings({ ...s, terms: { es: "x".repeat(8001), en: "" } }).ok, false);
  assert.equal(parseSettings({ ...s, assets: { logo: "../../etc/passwd", background: null } }).ok, false);
  assert.equal(parseSettings({ ...s, assets: { logo: "0123456789abcdef.png", background: null } }).ok, true);
});

test("no se puede publicar sin términos ni con poco contraste", () => {
  assert.ok(publishProblems(defaultSettings("X")).some((p) => p.includes("términos")));
  assert.deepEqual(publishProblems(valid()), []);
  const s = valid();
  s.colors = { ...s.colors, text: "#999999" };
  assert.ok(publishProblems(s).some((p) => p.includes("contraste")));
  const en = { ...valid(), default_locale: "en" as const };
  assert.ok(publishProblems(en).some((p) => p.includes("términos")));
});

test("detecta imágenes por contenido real", () => {
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "png");
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpg");
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffImage(webp), "webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("<html><script>")), null);
  assert.equal(sniffImage(new Uint8Array([])), null);
});

test("elección de idioma", () => {
  assert.equal(pickLocale("en", "es-PA,es;q=0.9", "es"), "en");
  assert.equal(pickLocale(undefined, "en-US,en;q=0.9", "es"), "en");
  assert.equal(pickLocale(undefined, "fr-FR", "es"), "es");
  assert.equal(pickLocale("xx", null, "en"), "en");
});
