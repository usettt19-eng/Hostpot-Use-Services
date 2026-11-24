import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUESTIONS, QUESTION_IDS, validateAnswers, cleanAnswers, parseAudience, audienceMatches, breakdown, isQuestionVisible, questionUi, answerLabel,
  buildCatalog, checkCustomQuestion, textProblem, MAX_QUESTIONS, type QuestionConfig, type CustomQuestion,
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

test("las respuestas guardadas se leen con forma segura, sin depender del catálogo", () => {
  assert.deepEqual(cleanAnswers({ residence: "foreign", custom1: "o2", age: 5, Raro: "x", otra: "<b>", larga: "x".repeat(30) }), { residence: "foreign", custom1: "o2" });
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

test("ajustes del portal: las preguntas son opcionales, máximo 4 activas, sin repetir y sin ids inventados", () => {
  const s = defaultSettings("Café");
  assert.ok(parseSettings(s).ok && parseSettings({ ...s, questions: undefined, custom_questions: undefined }).ok, "un portal guardado antes del módulo sigue siendo válido");
  assert.ok(parseSettings({ ...s, questions: [{ id: "residence", mode: "required" }] }).ok);
  assert.ok(parseSettings({ ...s, questions: ["residence", "stay", "purpose", "source"].map((id) => ({ id, mode: "optional" })) }).ok, `hasta ${MAX_QUESTIONS}`);
  assert.ok(!parseSettings({ ...s, questions: ["residence", "stay", "purpose", "source", "age"].map((id) => ({ id, mode: "optional" })) }).ok, "más de 4");
  assert.ok(!parseSettings({ ...s, questions: [{ id: "residence", mode: "optional" }, { id: "residence", mode: "required" }] }).ok, "repetida");
  assert.ok(!parseSettings({ ...s, questions: [{ id: "religion", mode: "optional" }] }).ok, "pregunta fuera del catálogo");
});

const custom1: CustomQuestion = {
  id: "custom1", label: { es: "¿Qué prefieres?", en: "What do you prefer?" },
  options: [{ value: "o1", es: "Carne", en: "Meat" }, { value: "o2", es: "Pescado", en: "Fish" }, { value: "o3", es: "Vegetariano", en: "Vegetarian" }],
};

test("pregunta propia: se valida el texto y las opciones, y se normalizan los valores", () => {
  const ok = checkCustomQuestion({ id: "custom2", label: { es: "  ¿Qué te gusta más? " }, options: [{ es: "Carne" }, { es: " " }, { es: "Pescado", en: "Fish" }] });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.q.options, [{ value: "o1", es: "Carne", en: "Carne" }, { value: "o2", es: "Pescado", en: "Fish" }], "las vacías se quitan; el inglés vacío usa el español");
    assert.equal(ok.q.label.en, "¿Qué te gusta más?");
  }
  const bad = (o: Parameters<typeof checkCustomQuestion>[0]) => { const r = checkCustomQuestion(o); assert.ok(!r.ok, JSON.stringify(o)); return r.ok ? "" : r.error; };
  bad({ id: "custom1", label: { es: "" }, options: [{ es: "a" }, { es: "b" }] });
  bad({ id: "custom1", label: { es: "x".repeat(101) }, options: [{ es: "a" }, { es: "b" }] });
  assert.match(bad({ id: "custom1", label: { es: "¿Cuál?" }, options: [{ es: "solo una" }] }), /entre 2 y 6/);
  bad({ id: "custom1", label: { es: "¿Cuál?" }, options: Array.from({ length: 7 }, (_, i) => ({ es: `op${i}` })) });
  assert.match(bad({ id: "custom1", label: { es: "¿Cuál?" }, options: [{ es: "Sí" }, { es: "sí" }] }), /repetidas/);
  bad({ id: "custom1", label: { es: "<script>alert(1)</script>" }, options: [{ es: "a" }, { es: "b" }] });
  bad({ id: "custom1", label: { es: "¿Cuál?" }, options: [{ es: "<b>a</b>" }, { es: "b" }] });
});

test("pregunta propia: rechaza los temas delicados (ayuda, no garantía)", () => {
  for (const t of ["¿Cuál es tu religión?", "¿Tienes alguna enfermedad?", "¿Por qué partido votas?", "¿Cuál es tu orientación sexual?", "¿Cuáles son tus ingresos?", "What is your religion?", "Do you have a disability?"]) {
    assert.ok(textProblem(t, 100), t);
  }
  for (const t of ["¿Qué prefieres comer?", "¿Vienes con niños?", "¿Cómo llegaste hasta aquí?"]) assert.equal(textProblem(t, 100), null, t);
});

test("pregunta propia: el catálogo del local suma las suyas a las fijas y todo funciona con ellas", () => {
  const cat = buildCatalog([custom1]);
  assert.ok(cat.residence && cat.custom1 && !cat.custom2);
  assert.equal(cat.custom1.short, "¿Qué prefieres?");
  const cfg: QuestionConfig[] = [{ id: "residence", mode: "optional" }, { id: "custom1", mode: "required" }];
  assert.deepEqual(validateAnswers(cfg, { residence: "resident", custom1: "o2" }, "es", cat), { ok: true, answers: { residence: "resident", custom1: "o2" } });
  const miss = validateAnswers(cfg, { residence: "resident" }, "es", cat);
  assert.ok(!miss.ok && /¿Qué prefieres\?/.test(miss.error));
  assert.ok(!validateAnswers(cfg, { custom1: "o9" }, "es", cat).ok, "una opción que no existe no cuenta");
  assert.deepEqual(validateAnswers([{ id: "custom1", mode: "required" }], {}, "es"), { ok: true, answers: {} }, "sin esa pregunta en el catálogo, se ignora");
  // lo que ve el visitante
  const ui = questionUi(cfg, "en", cat);
  assert.equal(ui[1].label, "What do you prefer?");
  assert.deepEqual(ui[1].options.map((o) => o.label), ["Meat", "Fish", "Vegetarian"]);
  // público y estadísticas
  const aud = parseAudience({ q: "custom1", in: ["o1", "o9"] }, cat);
  assert.deepEqual(aud, { q: "custom1", in: ["o1"] });
  assert.equal(parseAudience({ q: "custom1", in: ["o1"] }), null, "con el catálogo fijo esa pregunta no existe");
  assert.ok(audienceMatches(aud, { custom1: "o1" }) && !audienceMatches(aud, { custom1: "o2" }));
  assert.equal(answerLabel("custom1", "o3", "es", cat), "Vegetariano");
  assert.equal(answerLabel("custom1", "o3"), "");
  const b = breakdown("custom1", [{ custom1: "o1" }, { custom1: "o1" }, { custom1: "o2" }, { custom1: "o9" }, {}], cat);
  assert.equal(b.answered, 3, "el valor que ya no existe no cuenta");
  assert.deepEqual(b.rows.map((r) => [r.label, r.count]), [["Carne", 2], ["Pescado", 1], ["Vegetariano", 0]]);
});

test("ajustes del portal: las preguntas propias se validan al guardar y una activa debe estar definida", () => {
  const s = defaultSettings("Café");
  const q = { id: "custom1", label: custom1.label, options: custom1.options };
  assert.ok(parseSettings({ ...s, custom_questions: [q], questions: [{ id: "custom1", mode: "optional" }] }).ok);
  assert.ok(parseSettings({ ...s, custom_questions: [q] }).ok, "definida pero apagada");
  const undef = parseSettings({ ...s, questions: [{ id: "custom2", mode: "optional" }] });
  assert.ok(!undef.ok && /sin definir/.test(undef.errors.join()));
  assert.ok(!parseSettings({ ...s, custom_questions: [{ ...q, label: { es: "¿Cuál es tu religión?", en: "" } }] }).ok, "tema delicado");
  assert.ok(!parseSettings({ ...s, custom_questions: [{ ...q, options: [q.options[0]] }] }).ok, "una sola opción");
  assert.ok(!parseSettings({ ...s, custom_questions: [q, q] }).ok, "ranura repetida");
  assert.ok(!parseSettings({ ...s, custom_questions: [{ ...q, id: "custom9" }] }).ok, "ranura inventada");
  assert.ok(parseSettings({ ...s, custom_questions: [q], questions: ["residence", "stay", "purpose", "custom1"].map((id) => ({ id, mode: "optional" })) }).ok, "4 activas entre fijas y propias");
});

test("el módulo de preguntas no aplica a escuelas", () => {
  assert.ok(!moduleAppliesTo("guest_profile", "school"));
  for (const t of ["restaurant", "pub", "hotel"]) assert.ok(moduleAppliesTo("guest_profile", t), t);
  assert.ok(moduleAppliesTo("promotions", "school"), "las promociones sí");
  assert.ok(!moduleAppliesTo("otro", "restaurant"));
});
