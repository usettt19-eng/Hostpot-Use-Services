import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUESTIONS, QUESTION_IDS, validateAnswers, cleanAnswers, parseAudience, audienceMatches, breakdown, isQuestionVisible, questionUi, answerLabel,
  type QuestionConfig,
} from "../lib/guest-questions.ts";
import { parseSettings, defaultSettings } from "../lib/portal-settings.ts";
import { moduleAppliesTo } from "../lib/modules.ts";

const both: QuestionConfig[] = [{ id: "residence", mode: "required" }, { id: "stay", mode: "optional" }];

test("el catálogo es coherente: opciones únicas, textos en los dos idiomas y sin menores en la edad", () => {
  for (const id of QUESTION_IDS) {
    const q = QUESTIONS[id];
    assert.ok(q.label.es && q.label.en && q.short, id);
    assert.equal(new Set(q.options.map((o) => o.value)).size, q.options.length, `valores repetidos en ${id}`);
    for (const o of q.options) assert.ok(o.es && o.en, `${id}/${o.value}`);
  }
  assert.ok(!QUESTIONS.age.options.some((o) => /17|16|menor|under/i.test(o.es + o.en + o.value)), "sin menores de edad");
});

test("valida respuestas: acepta opciones del catálogo y exige las obligatorias", () => {
  assert.deepEqual(validateAnswers(both, { residence: "foreign", stay: "week" }), { ok: true, answers: { residence: "foreign", stay: "week" } });
  const missing = validateAnswers(both, { stay: "week" });
  assert.ok(!missing.ok && /¿Eres de aquí\?/.test(missing.error));
  const missingEn = validateAnswers(both, {}, "en");
  assert.ok(!missingEn.ok && /^Please answer/.test(missingEn.error));
  // opcional sin responder: sigue
  assert.deepEqual(validateAnswers(both, { residence: "national" }), { ok: true, answers: { residence: "national" } });
});

test("descarta lo que no corresponde: valores inventados, preguntas que el local no hace y la estancia de un residente", () => {
  const r = validateAnswers(both, { residence: "resident", stay: "week", purpose: "work", evil: "<script>" });
  assert.deepEqual(r, { ok: true, answers: { residence: "resident" } });
  const bad = validateAnswers([{ id: "residence", mode: "optional" }], { residence: "<b>x</b>" });
  assert.deepEqual(bad, { ok: true, answers: {} });
  const badRequired = validateAnswers([{ id: "residence", mode: "required" }], { residence: "martian" });
  assert.ok(!badRequired.ok, "un valor inventado no cuenta como respuesta");
  // la estancia obligatoria no se exige a un residente, pero sí a quien no lo es
  const stayReq: QuestionConfig[] = [{ id: "residence", mode: "optional" }, { id: "stay", mode: "required" }];
  assert.ok(validateAnswers(stayReq, { residence: "resident" }).ok);
  assert.ok(!validateAnswers(stayReq, { residence: "foreign" }).ok);
  // sin preguntar la residencia, la estancia se pregunta siempre
  assert.ok(isQuestionVisible("stay", [{ id: "stay", mode: "optional" }], "resident"));
});

test("las respuestas guardadas se limpian al leerlas", () => {
  assert.deepEqual(cleanAnswers({ residence: "foreign", stay: "nada", otra: "x", age: 5 }), { residence: "foreign" });
  assert.deepEqual(cleanAnswers(null), {});
  assert.deepEqual(cleanAnswers(["resident"]), {});
  assert.deepEqual(cleanAnswers("resident"), {});
});

test("público por respuestas: quien no contestó no la ve", () => {
  const a = parseAudience({ q: "residence", in: ["resident", "national", "resident", "foo"] });
  assert.deepEqual(a, { q: "residence", in: ["resident", "national"] });
  assert.equal(parseAudience({ q: "nope", in: ["x"] }), null);
  assert.equal(parseAudience({ q: "residence", in: ["foo"] }), null, "sin valores válidos");
  assert.equal(parseAudience(null), null);
  assert.ok(audienceMatches(null, {}), "sin público: para todos");
  assert.ok(audienceMatches(a, { residence: "national" }));
  assert.ok(!audienceMatches(a, { residence: "foreign" }));
  assert.ok(!audienceMatches(a, {}), "no contestó");
  assert.ok(!audienceMatches(a, undefined));
});

test("conteos para las estadísticas", () => {
  const b = breakdown("residence", [{ residence: "resident" }, { residence: "resident" }, { residence: "foreign" }, {}, { stay: "week" }]);
  assert.equal(b.total, 5); assert.equal(b.answered, 3);
  assert.deepEqual(b.rows.map((r) => [r.value, r.count]), [["resident", 2], ["national", 0], ["foreign", 1]]);
});

test("textos para el visitante según el idioma", () => {
  const ui = questionUi(both, "en");
  assert.equal(ui[0].label, "Are you from around here?");
  assert.equal(ui[0].required, true); assert.equal(ui[1].required, false);
  assert.equal(ui[0].options[0].label, "I live in the city");
  assert.equal(answerLabel("residence", "foreign"), "Estoy de visita desde otro país");
});

test("ajustes del portal: las preguntas son opcionales, máximo 3, sin repetir y sin ids inventados", () => {
  const s = defaultSettings("Café");
  assert.ok(parseSettings(s).ok && parseSettings({ ...s, questions: undefined }).ok, "un portal guardado antes del módulo sigue siendo válido");
  assert.ok(parseSettings({ ...s, questions: [{ id: "residence", mode: "required" }] }).ok);
  assert.ok(!parseSettings({ ...s, questions: ["residence", "stay", "purpose", "source"].map((id) => ({ id, mode: "optional" })) }).ok, "más de 3");
  assert.ok(!parseSettings({ ...s, questions: [{ id: "residence", mode: "optional" }, { id: "residence", mode: "required" }] }).ok, "repetida");
  assert.ok(!parseSettings({ ...s, questions: [{ id: "religion", mode: "optional" }] }).ok, "pregunta fuera del catálogo");
});

test("el módulo de preguntas no aplica a escuelas", () => {
  assert.ok(!moduleAppliesTo("guest_profile", "school"));
  for (const t of ["restaurant", "pub", "hotel"]) assert.ok(moduleAppliesTo("guest_profile", t), t);
  assert.ok(moduleAppliesTo("promotions", "school"), "las promociones sí");
  assert.ok(!moduleAppliesTo("otro", "restaurant"));
});
