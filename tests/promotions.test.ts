import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ctaHost, activeCtaHosts, parsePromotion, parseContent, inSegment, pickPromotion, panamaLocalToIso, isoToPanamaLocal, promoPageUrl, ctrText,
  type PromoCandidate,
} from "../lib/promotions.ts";
import { isModuleKey, MODULE_KEYS } from "../lib/modules.ts";

const content = { title: "2x1 en café", body: "Hoy hasta las 5", cta_label: "Ver menú", cta_url: "https://ejemplo.com/menu", image: null };
const base = { name: "Café", segment: "all", inactive_days: 30, content, starts_at: null, ends_at: null };
const now = new Date("2026-10-24T15:00:00Z");

test("módulos: solo existen los registrados", () => {
  assert.ok(isModuleKey("promotions"));
  assert.ok(!isModuleKey("toString") && !isModuleKey("x"));
  assert.deepEqual(MODULE_KEYS, ["promotions"]);
});

test("valida la campaña: título, enlace https, botón con texto y fechas", () => {
  assert.ok(parsePromotion(base).ok);
  assert.ok(!parsePromotion({ ...base, content: { ...content, title: "" } }).ok);
  assert.ok(!parsePromotion({ ...base, content: { ...content, cta_url: "http://ejemplo.com" } }).ok);
  assert.ok(!parsePromotion({ ...base, content: { ...content, cta_url: "https://u:p@ejemplo.com" } }).ok);
  assert.ok(!parsePromotion({ ...base, content: { ...content, cta_url: "javascript:alert(1)" } }).ok);
  assert.ok(!parsePromotion({ ...base, content: { ...content, cta_label: "" } }).ok, "enlace sin texto de botón");
  assert.ok(parsePromotion({ ...base, content: { ...content, cta_label: "", cta_url: "" } }).ok, "sin enlace no hace falta botón");
  assert.ok(!parsePromotion({ ...base, content: { ...content, image: "../../etc/passwd" } }).ok);
  assert.ok(!parsePromotion({ ...base, segment: "todos" }).ok);
  assert.ok(!parsePromotion({ ...base, inactive_days: 3 }).ok);
  assert.ok(!parsePromotion({ ...base, starts_at: "2026-10-25T00:00:00.000Z", ends_at: "2026-10-24T00:00:00.000Z" }).ok);
  assert.equal(parseContent({ title: "x", body: "", cta_label: "", cta_url: "javascript:1", image: null }), null);
});

test("fechas del formulario en hora de Panamá (UTC-5)", () => {
  assert.equal(panamaLocalToIso("2026-10-24T18:30"), "2026-10-24T23:30:00.000Z");
  assert.equal(panamaLocalToIso(""), null);
  assert.equal(panamaLocalToIso("mañana"), undefined);
  assert.equal(isoToPanamaLocal("2026-10-24T23:30:00.000Z"), "2026-10-24T18:30");
  assert.equal(isoToPanamaLocal(null), "");
});

test("segmentos: nuevo, recurrente y ausente", () => {
  const first = { visitCount: 1, lastSeenBefore: null };
  const again = { visitCount: 3, lastSeenBefore: new Date("2026-10-20T00:00:00Z") };
  const away = { visitCount: 3, lastSeenBefore: new Date("2026-08-01T00:00:00Z") };
  assert.ok(inSegment("all", first, 30, now) && inSegment("all", away, 30, now));
  assert.ok(inSegment("new", first, 30, now) && !inSegment("new", again, 30, now));
  assert.ok(!inSegment("returning", first, 30, now) && inSegment("returning", again, 30, now));
  assert.ok(!inSegment("inactive", first, 30, now), "el nuevo no es ausente");
  assert.ok(!inSegment("inactive", again, 30, now), "volvió hace 4 días");
  assert.ok(inSegment("inactive", away, 30, now));
  assert.ok(!inSegment("inactive", away, 90, now), "con umbral de 90 días todavía no");
});

const cand = (o: Partial<PromoCandidate> & { id: string }): PromoCandidate => ({
  status: "active", segment: "all", inactive_days: 30, starts_at: null, ends_at: null, created_at: "2026-10-01T00:00:00Z", content, ...o,
});

test("elige la campaña vigente más específica y la más reciente a igualdad", () => {
  const away = { visitCount: 5, lastSeenBefore: new Date("2026-08-01T00:00:00Z") };
  const list = [
    cand({ id: "todos" }),
    cand({ id: "rec", segment: "returning" }),
    cand({ id: "aus", segment: "inactive" }),
    cand({ id: "aus-vieja", segment: "inactive", created_at: "2026-09-01T00:00:00Z" }),
  ];
  assert.equal(pickPromotion(list, away, now)?.id, "aus");
  assert.equal(pickPromotion(list, { visitCount: 1, lastSeenBefore: null }, now)?.id, "todos");
});

test("no elige borradores, pausadas, fuera de fecha ni con contenido dañado", () => {
  const g = { visitCount: 2, lastSeenBefore: new Date("2026-10-23T00:00:00Z") };
  assert.equal(pickPromotion([cand({ id: "a", status: "draft" }), cand({ id: "b", status: "paused" })], g, now), null);
  assert.equal(pickPromotion([cand({ id: "c", starts_at: "2026-10-25T00:00:00Z" })], g, now), null);
  assert.equal(pickPromotion([cand({ id: "d", ends_at: "2026-10-24T14:00:00Z" })], g, now), null);
  assert.equal(pickPromotion([cand({ id: "e", content: { title: "" } })], g, now), null);
  assert.equal(pickPromotion([cand({ id: "f", ends_at: "2026-10-24T16:00:00Z" })], g, now)?.id, "f");
});

test("URL de la página de la campaña y porcentaje de clics", () => {
  assert.equal(promoPageUrl("https://connect.x.com/", "mi-local", "abc", "TOKEN_1-x"), "https://connect.x.com/w/mi-local/promo/abc?t=TOKEN_1-x");
  assert.equal(promoPageUrl("https://connect.x.com", "mi-local", "abc", "a+b/c="), "https://connect.x.com/w/mi-local/promo/abc?t=a%2Bb%2Fc%3D");
  assert.equal(ctrText(0, 0), "—");
  assert.equal(ctrText(200, 5), "2.5 %");
});

test("sitio del botón: solo dominios normales por https, sin www ni IP", () => {
  assert.equal(ctaHost("https://www.Ejemplo.com/menu?x=1"), "ejemplo.com");
  assert.equal(ctaHost("https://menu.cafe-sol.com.pa/"), "menu.cafe-sol.com.pa");
  assert.equal(ctaHost("http://ejemplo.com"), null);
  assert.equal(ctaHost("https://192.168.1.5/x"), null);
  assert.equal(ctaHost("https://localhost/x"), null);
  assert.equal(ctaHost("https://exa mple.com"), null);
  assert.equal(ctaHost("no es una url"), null);
});

test("sitios de las campañas activas: sin repetir, ignora pausadas, borradores y sin enlace", () => {
  const mk = (status: string, cta_url: string) => ({ status, content: { title: "t", body: "", cta_label: cta_url ? "Ver" : "", cta_url, image: null } });
  assert.deepEqual(activeCtaHosts([
    mk("active", "https://b.com/x"), mk("active", "https://www.a.com/y"), mk("active", "https://a.com/z"),
    mk("paused", "https://pausada.com"), mk("draft", "https://borrador.com"), mk("active", ""),
    { status: "active", content: { title: "" } },
  ]), ["a.com", "b.com"]);
});
