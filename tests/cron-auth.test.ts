import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedCron } from "../lib/cron-auth.ts";

const S = "a".repeat(32);

test("acepta solo el secreto correcto", () => {
  assert.equal(isAuthorizedCron(`Bearer ${S}`, S), true);
  assert.equal(isAuthorizedCron(`Bearer ${"b".repeat(32)}`, S), false);
  assert.equal(isAuthorizedCron(S, S), false);
  assert.equal(isAuthorizedCron(`bearer ${S}`, S), false);
  assert.equal(isAuthorizedCron(`Bearer ${S}x`, S), false);
  assert.equal(isAuthorizedCron(null, S), false);
  assert.equal(isAuthorizedCron("", S), false);
});

test("sin secreto configurado o demasiado corto, nada se autoriza", () => {
  assert.equal(isAuthorizedCron("Bearer ", undefined), false);
  assert.equal(isAuthorizedCron("Bearer ", ""), false);
  assert.equal(isAuthorizedCron("Bearer abc", "abc"), false);
  assert.equal(isAuthorizedCron("Bearer abc", "abc"), false);
});
