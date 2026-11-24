// Preguntas opcionales al visitante (módulo «Preguntas al visitante»). Hay un catálogo FIJO de cinco preguntas (comparables entre locales) y
// hasta tres PREGUNTAS PROPIAS que cada local escribe, siempre de respuesta cerrada (el visitante elige una opción; nunca texto libre).
// Función pura: validación y conteos.

/** Preguntas del catálogo fijo. */
export const QUESTION_IDS = ["residence", "stay", "purpose", "source", "age"] as const;
export type PresetId = (typeof QUESTION_IDS)[number];
/** Ranuras de las preguntas propias del local (el id es estable: las respuestas se guardan con él). */
export const CUSTOM_IDS = ["custom1", "custom2", "custom3"] as const;
export type CustomId = (typeof CUSTOM_IDS)[number];
/** Cualquier pregunta: del catálogo o propia. */
export type QuestionId = PresetId | CustomId;
/** Máximo de preguntas activas en total (más hace que la gente abandone la conexión). */
export const MAX_QUESTIONS = 4;
export const QUESTION_MODES = ["optional", "required"] as const;
export type QuestionMode = (typeof QUESTION_MODES)[number];

export type QuestionDef = {
  label: { es: string; en: string };
  /** Nombre corto para el panel (columnas y estadísticas). */
  short: string;
  options: { value: string; es: string; en: string }[];
};

export const QUESTIONS: Record<PresetId, QuestionDef> = {
  residence: {
    short: "Residencia",
    label: { es: "¿Eres de aquí?", en: "Are you from around here?" },
    options: [
      { value: "resident", es: "Vivo en la ciudad", en: "I live in the city" },
      { value: "national", es: "Vivo en otra ciudad del país", en: "I live in another city in the country" },
      { value: "foreign", es: "Estoy de visita desde otro país", en: "I am visiting from another country" },
    ],
  },
  stay: {
    short: "Estancia",
    label: { es: "¿Cuánto tiempo estarás en la ciudad?", en: "How long will you be in the city?" },
    options: [
      { value: "today", es: "Solo hoy", en: "Just today" },
      { value: "days", es: "2 a 3 días", en: "2 to 3 days" },
      { value: "week", es: "Una semana", en: "A week" },
      { value: "more", es: "Más de una semana", en: "More than a week" },
    ],
  },
  purpose: {
    short: "Motivo de la visita",
    label: { es: "¿Cuál es el motivo de tu visita?", en: "What brings you here?" },
    options: [
      { value: "tourism", es: "Turismo", en: "Tourism" },
      { value: "work", es: "Trabajo", en: "Work" },
      { value: "family", es: "Familia o amigos", en: "Family or friends" },
      { value: "other", es: "Otro", en: "Other" },
    ],
  },
  source: {
    short: "Cómo nos conoció",
    label: { es: "¿Cómo nos conociste?", en: "How did you find us?" },
    options: [
      { value: "passing", es: "Pasaba por aquí", en: "Walking by" },
      { value: "social", es: "Redes sociales", en: "Social media" },
      { value: "recommended", es: "Me lo recomendaron", en: "Recommended to me" },
      { value: "search", es: "Búsqueda en internet o mapas", en: "Web or maps search" },
      { value: "other", es: "Otro", en: "Other" },
    ],
  },
  age: {
    short: "Edad",
    label: { es: "¿En qué rango de edad estás?", en: "What is your age range?" },
    // Sin menores de edad: no se recogen datos de menores
    options: [
      { value: "18-24", es: "18 a 24", en: "18 to 24" },
      { value: "25-34", es: "25 a 34", en: "25 to 34" },
      { value: "35-44", es: "35 a 44", en: "35 to 44" },
      { value: "45-54", es: "45 a 54", en: "45 to 54" },
      { value: "55+", es: "55 o más", en: "55 or more" },
    ],
  },
};

export const isPresetId = (v: string): v is PresetId => (QUESTION_IDS as readonly string[]).includes(v);
export const isCustomId = (v: string): v is CustomId => (CUSTOM_IDS as readonly string[]).includes(v);
export const isQuestionId = (v: string): v is QuestionId => isPresetId(v) || isCustomId(v);

// ---- Preguntas propias del local ----

export type CustomQuestion = { id: CustomId; label: { es: string; en: string }; options: { value: string; es: string; en: string }[] };
export const CUSTOM_LIMITS = { label: 100, option: 60, minOptions: 2, maxOptions: 6 } as const;

/** Catálogo efectivo de un local: las cinco fijas más las propias que haya definido. */
export type Catalog = Record<string, QuestionDef>;

export function buildCatalog(custom: CustomQuestion[] = []): Catalog {
  const out: Catalog = { ...QUESTIONS };
  for (const c of custom) {
    out[c.id] = { short: c.label.es.slice(0, 28), label: c.label, options: c.options.map((o) => ({ value: o.value, es: o.es, en: o.en || o.es })) };
  }
  return out;
}

/** Ayuda para que no se pidan datos delicados (salud, religión, política, orientación sexual, origen étnico…). No es una garantía: el local sigue siendo responsable. */
const SENSITIVE = /salud|enferm|embaraz|diagn[oó]stic|discapacidad|religi|cristian|cat[oó]lic|evang[eé]l|musulm|ateo|pol[ií]tic|partido|vot[oa]|sindic|orientaci[oó]n sexual|gay|lesbi|homosex|transg|raza|[eé]tnic|ingresos|salario|deuda|antecedentes|health|illness|pregnan|disabilit|religio|politic|party|vote|union member|sexual orientation|ethnic|income|salary|criminal/i;

/** Texto de una pregunta propia o de sus opciones: sin etiquetas, sin saltos de línea y sin temas delicados. Devuelve el error o null. */
export function textProblem(text: string, max: number): string | null {
  const t = text.trim();
  if (!t) return "No puede quedar vacío";
  if (t.length > max) return `Máximo ${max} caracteres`;
  if (/[<>]|[\r\n]/.test(t)) return "No uses símbolos < > ni saltos de línea";
  if (SENSITIVE.test(t)) return "No se permiten preguntas sobre datos delicados (salud, religión, política, orientación sexual, origen étnico, ingresos…)";
  return null;
}

/** Valida y normaliza una pregunta propia: texto, 2 a 6 opciones sin repetir y valores o1…o6. Devuelve el error en español o la pregunta limpia. */
export function checkCustomQuestion(c: { id: CustomId; label: { es: string; en?: string }; options: { es: string; en?: string }[] }):
  { ok: true; q: CustomQuestion } | { ok: false; error: string } {
  const name = `Pregunta propia ${c.id.slice(-1)}`;
  const lab = textProblem(c.label.es, CUSTOM_LIMITS.label);
  if (lab) return { ok: false, error: `${name}, texto: ${lab}` };
  const labEn = (c.label.en ?? "").trim();
  if (labEn) { const e = textProblem(labEn, CUSTOM_LIMITS.label); if (e) return { ok: false, error: `${name}, texto en inglés: ${e}` }; }
  const opts = c.options.map((o) => ({ es: o.es.trim(), en: (o.en ?? "").trim() })).filter((o) => o.es || o.en);
  if (opts.length < CUSTOM_LIMITS.minOptions || opts.length > CUSTOM_LIMITS.maxOptions) {
    return { ok: false, error: `${name}: escribe entre ${CUSTOM_LIMITS.minOptions} y ${CUSTOM_LIMITS.maxOptions} opciones` };
  }
  for (const o of opts) {
    const e = textProblem(o.es, CUSTOM_LIMITS.option);
    if (e) return { ok: false, error: `${name}, opción «${o.es.slice(0, 20)}»: ${e}` };
    if (o.en) { const e2 = textProblem(o.en, CUSTOM_LIMITS.option); if (e2) return { ok: false, error: `${name}, opción en inglés «${o.en.slice(0, 20)}»: ${e2}` }; }
  }
  if (new Set(opts.map((o) => o.es.toLowerCase())).size !== opts.length) return { ok: false, error: `${name}: hay opciones repetidas` };
  return { ok: true, q: { id: c.id, label: { es: c.label.es.trim(), en: labEn || c.label.es.trim() }, options: opts.map((o, i) => ({ value: `o${i + 1}`, es: o.es, en: o.en || o.es })) } };
}

export type QuestionConfig = { id: QuestionId; mode: QuestionMode };
export type Answers = Record<string, string>;

const optionValues = (id: string, catalog: Catalog) => catalog[id]?.options.map((o) => o.value) ?? [];

/**
 * La pregunta de estancia solo se hace a quien no vive en la ciudad (si también se pregunta la residencia).
 * `residence` = la respuesta de residencia ya dada ("" si aún no).
 */
export function isQuestionVisible(id: string, configured: QuestionConfig[], residence: string): boolean {
  if (id !== "stay") return true;
  const asksResidence = configured.some((q) => q.id === "residence");
  return !asksResidence || residence !== "resident";
}

export type AnswersResult = { ok: true; answers: Answers } | { ok: false; error: string };

/**
 * Valida lo que respondió el visitante contra las preguntas configuradas del local (`catalog` incluye las propias). Se descartan en silencio las
 * respuestas de preguntas que el local no hace, las que no se muestran (estancia de un residente) y los valores que no son opciones; falta una obligatoria: error.
 */
export function validateAnswers(configured: QuestionConfig[], raw: Record<string, string | undefined>, locale: "es" | "en" = "es", catalog: Catalog = QUESTIONS): AnswersResult {
  const answers: Answers = {};
  const residence = optionValues("residence", catalog).includes(raw.residence ?? "") ? (raw.residence as string) : "";
  for (const q of configured) {
    const def = catalog[q.id];
    if (!def) continue; // pregunta que ya no existe: se ignora
    if (!isQuestionVisible(q.id, configured, residence)) continue;
    const v = (raw[q.id] ?? "").trim();
    if (v && optionValues(q.id, catalog).includes(v)) answers[q.id] = v;
    else if (q.mode === "required") {
      const name = def.label[locale];
      return { ok: false, error: locale === "en" ? `Please answer: ${name}` : `Responde: ${name}` };
    }
  }
  return { ok: true, answers };
}

/** Respuestas guardadas (jsonb) a un objeto con forma segura: ids y valores cortos de letras, números, guion y +. No depende del catálogo, para no perder respuestas de una pregunta propia que se quitó. */
export function cleanAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z][a-z0-9_]{0,19}$/.test(k) && typeof v === "string" && /^[a-z0-9+-]{1,20}$/.test(v)) out[k] = v;
  }
  return out;
}

/** Texto de una respuesta (para el panel y el CSV); vacío si la opción ya no existe. */
export function answerLabel(id: string, value: string | undefined, locale: "es" | "en" = "es", catalog: Catalog = QUESTIONS): string {
  return catalog[id]?.options.find((o) => o.value === value)?.[locale] ?? "";
}

// ---- Público de una promoción según las respuestas ----

export type Audience = { q: string; in: string[] };

export function parseAudience(raw: unknown, catalog: Catalog = QUESTIONS): Audience | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { q?: unknown; in?: unknown };
  if (typeof o.q !== "string" || !catalog[o.q] || !Array.isArray(o.in)) return null;
  const valid = optionValues(o.q, catalog);
  const values = [...new Set(o.in.filter((v): v is string => typeof v === "string" && valid.includes(v)))];
  return values.length ? { q: o.q, in: values } : null;
}

/** ¿Las respuestas del visitante cumplen el público de la promoción? Sin público: sí. Con público y sin esa respuesta: no. */
export function audienceMatches(audience: Audience | null, answers: Answers | undefined): boolean {
  if (!audience) return true;
  const v = answers?.[audience.q];
  return !!v && audience.in.includes(v);
}

// ---- Conteos para las estadísticas ----

export type Breakdown = { id: string; short: string; total: number; answered: number; rows: { value: string; label: string; count: number }[] };

/** Cuántos visitantes eligieron cada opción de una pregunta (las opciones sin respuestas también salen, con 0; los valores que ya no existen no cuentan). */
export function breakdown(id: string, profiles: Answers[], catalog: Catalog = QUESTIONS): Breakdown {
  const def = catalog[id];
  const counts = new Map<string, number>();
  let answered = 0;
  for (const p of profiles) {
    const v = p[id];
    if (!v || !def?.options.some((o) => o.value === v)) continue;
    answered++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return {
    id, short: def?.short ?? id, total: profiles.length, answered,
    rows: (def?.options ?? []).map((o) => ({ value: o.value, label: o.es, count: counts.get(o.value) ?? 0 })),
  };
}

// ---- Lo que ve el visitante ----

export type QuestionUi = { id: string; label: string; required: boolean; options: { value: string; label: string }[] };

/** Las preguntas configuradas del local, ya con los textos en el idioma del visitante. */
export function questionUi(configured: QuestionConfig[], locale: "es" | "en", catalog: Catalog = QUESTIONS): QuestionUi[] {
  return configured.filter((q) => catalog[q.id]).map((q) => ({
    id: q.id, label: catalog[q.id].label[locale], required: q.mode === "required",
    options: catalog[q.id].options.map((o) => ({ value: o.value, label: o[locale] })),
  }));
}
