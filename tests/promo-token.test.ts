import { test } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sealPromoTicket, openPromoTicket, PROMO_TOKEN_TTL_MS, type PromoTicket } from "../lib/promo-token.ts";

// Cifrado de prueba con la misma forma que lib/crypto.ts (AES-256-GCM)
const KEY = randomBytes(32);
const crypto = {
  encrypt(plain: string) {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", KEY, iv);
    const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
  },
  decrypt(blob: string) {
    const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  },
};

const T = "aaaaaaaa-0000-0000-0000-000000000000", P = "a1111111-0000-0000-0000-000000000000";
const ticket: PromoTicket = { tenantId: T, promoId: P, login: "http://192.168.200.1/login", username: "g_a1b2c3d4e5", password: "Ab3-_xyz12QW", next: "http://neverssl.com/" };
const NOW = 1_800_000_000_000;

test("el pedido se abre igual que se selló y no deja la contraseña a la vista", () => {
  const tok = sealPromoTicket(ticket, crypto, NOW);
  assert.match(tok, /^[A-Za-z0-9_-]+$/, "seguro para una URL");
  assert.ok(!tok.includes(ticket.password) && !Buffer.from(tok, "base64url").toString().includes(ticket.password));
  assert.deepEqual(openPromoTicket(tok, crypto, NOW + 1000), ticket);
});

test("vence a los 10 minutos", () => {
  const tok = sealPromoTicket(ticket, crypto, NOW);
  assert.ok(openPromoTicket(tok, crypto, NOW + PROMO_TOKEN_TTL_MS - 1));
  assert.equal(openPromoTicket(tok, crypto, NOW + PROMO_TOKEN_TTL_MS + 1), null);
});

test("rechaza códigos alterados, de otra clave, vacíos o enormes", () => {
  const tok = sealPromoTicket(ticket, crypto, NOW);
  const flipped = tok.slice(0, 20) + (tok[20] === "A" ? "B" : "A") + tok.slice(21);
  assert.equal(openPromoTicket(flipped, crypto, NOW), null);
  assert.equal(openPromoTicket(tok, { ...crypto, decrypt: () => { throw new Error("otra clave"); } }, NOW), null);
  assert.equal(openPromoTicket("", crypto, NOW), null);
  assert.equal(openPromoTicket("x".repeat(3000), crypto, NOW), null);
  assert.equal(openPromoTicket("no es un código", crypto, NOW), null);
});

test("rechaza un secreto cifrado para otra cosa y datos fuera de forma", () => {
  const wrap = (o: object) => Buffer.from(crypto.encrypt(JSON.stringify(o)), "utf8").toString("base64url");
  const ok = { k: "promo", e: NOW + 1000, t: T, i: P, l: ticket.login, u: ticket.username, p: ticket.password, n: "" };
  assert.ok(openPromoTicket(wrap(ok), crypto, NOW));
  assert.equal(openPromoTicket(wrap({ ...ok, k: "otro" }), crypto, NOW), null, "otro tipo de secreto");
  assert.equal(openPromoTicket(wrap({ ...ok, l: "http://evil.com/login" }), crypto, NOW), null, "el login debe ser una IP privada");
  assert.equal(openPromoTicket(wrap({ ...ok, l: "http://192.168.200.1/login?x=1" }), crypto, NOW), null);
  assert.equal(openPromoTicket(wrap({ ...ok, u: "admin" }), crypto, NOW), null, "solo usuarios de visitante");
  assert.equal(openPromoTicket(wrap({ ...ok, p: "a b;c" }), crypto, NOW), null);
  assert.equal(openPromoTicket(wrap({ ...ok, t: "../x" }), crypto, NOW), null);
  assert.equal(openPromoTicket(wrap({ ...ok, e: "mañana" }), crypto, NOW), null);
  assert.equal(openPromoTicket(wrap({ ...ok, n: "javascript:alert(1)" }), crypto, NOW)?.next, "", "el destino inválido se descarta");
});
