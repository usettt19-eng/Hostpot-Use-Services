import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  generateCode, normalizeCode, canSend, checkCode, maskEmail, otpEmail,
  OTP_MAX_ATTEMPTS, OTP_COOLDOWN_MS, OTP_SEND_WINDOW_MS, OTP_TTL_MS, type OtpRecord,
} from "../lib/otp.ts";

const hash = (c: string) => createHmac("sha256", "k").update(`s:${c}`).digest("hex");
const NOW = new Date("2026-10-25T15:00:00Z");
const rec = (o: Partial<OtpRecord> = {}): OtpRecord => ({ codeHash: hash("123456"), attempts: 0, expiresAt: new Date(NOW.getTime() + 60_000), consumedAt: null, ...o });

test("el código tiene 6 dígitos con ceros a la izquierda", () => {
  assert.equal(generateCode(() => 0), "000000");
  assert.equal(generateCode(() => 42), "000042");
  assert.equal(generateCode(() => 999_999), "999999");
  assert.match(generateCode((m) => Math.floor(Math.random() * m)), /^\d{6}$/);
});

test("normaliza lo que escribe o pega el visitante", () => {
  assert.equal(normalizeCode("123456"), "123456");
  assert.equal(normalizeCode(" 123 456 "), "123456");
  assert.equal(normalizeCode("123-456"), "123456");
  assert.equal(normalizeCode("12345"), "");
  assert.equal(normalizeCode("1234567"), "");
  assert.equal(normalizeCode("abcdef"), "");
});

test("límites de envío: 3 por correo en 15 minutos y 30 segundos entre envíos", () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  assert.equal(canSend([], NOW).ok, true);
  assert.equal(canSend([ago(OTP_COOLDOWN_MS + 1000)], NOW).ok, true);
  assert.equal(canSend([ago(5000)], NOW).ok, false, "demasiado pronto");
  assert.equal(canSend([ago(60_000), ago(120_000), ago(180_000)], NOW).ok, false, "ya van 3");
  assert.equal(canSend([ago(OTP_SEND_WINDOW_MS + 1000), ago(OTP_SEND_WINDOW_MS + 2000), ago(OTP_SEND_WINDOW_MS + 3000)], NOW).ok, true, "los viejos no cuentan");
});

test("comprueba el código: correcto, equivocado, vencido, usado y bloqueado", () => {
  assert.deepEqual(checkCode(rec(), "123456", hash, NOW), { ok: true });
  assert.deepEqual(checkCode(rec(), "123 456", hash, NOW), { ok: true }, "con espacios");
  const wrong = checkCode(rec(), "000000", hash, NOW);
  assert.ok(!wrong.ok && wrong.countAttempt);
  const bad = checkCode(rec(), "12", hash, NOW);
  assert.ok(!bad.ok && bad.countAttempt, "formato inválido también cuenta");
  const expired = checkCode(rec({ expiresAt: new Date(NOW.getTime() - 1) }), "123456", hash, NOW);
  assert.ok(!expired.ok && !expired.countAttempt && /venci/.test(expired.error));
  assert.ok(!checkCode(rec({ consumedAt: NOW }), "123456", hash, NOW).ok, "ya usado");
  assert.ok(!checkCode(null, "123456", hash, NOW).ok, "sin código pendiente");
  const locked = checkCode(rec({ attempts: OTP_MAX_ATTEMPTS }), "123456", hash, NOW);
  assert.ok(!locked.ok && /intentos/.test(locked.error), "con el código correcto pero bloqueado");
});

test("textos del correo y correo enmascarado", () => {
  assert.equal(maskEmail("ana.perez@correo.com"), "a•••@correo.com");
  const es = otpEmail("es", { place: "Café Sol", code: "123456" });
  assert.match(es.subject, /123456/); assert.match(es.text, /Café Sol/); assert.match(es.text, new RegExp(`${OTP_TTL_MS / 60_000} minutos`));
  const en = otpEmail("en", { place: "Café Sol", code: "123456" });
  assert.match(en.text, /expires in 10 minutes/);
  assert.ok(!/<[a-z]/i.test(es.text + en.text), "sin HTML");
});
