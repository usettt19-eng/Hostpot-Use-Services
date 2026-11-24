// Preguntas opcionales al visitante (módulo «Preguntas al visitante»). Catálogo FIJO: el local elige cuáles hacer, no escribe las suyas
// (así no hay texto libre ni HTML del cliente y las respuestas son comparables entre locales). Función pura: validación y conteos.

export const QUESTION_IDS = ["residence", "stay", "purpose", "source", "age"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];
export const MAX_QUESTIONS = 3;
export const QUESTION_MODES = ["optional", "required"] as const;
export type QuestionMode = (typeof QUESTION_MODES)[number];

export type QuestionDef = {
  label: { es: string; en: string };
  /** Nombre corto para el panel (columnas y estadísticas). */
  short: string;
  options: { value: string; es: string; en: string }[];
};

export const QUESTIONS: Record<QuestionId, QuestionDef> = {
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

export const isQuestionId = (v: string): v is QuestionId => (QUESTION_IDS as readonly string[]).includes(v);

export type QuestionConfig = { id: QuestionId; mode: QuestionMode };
export type Answers = Partial<Record<QuestionId, string>>;

const optionValues = (id: QuestionId) => QUESTIONS[id].options.map((o) => o.value);

/**
 * La pregunta de estancia solo se hace a quien no vive en la ciudad (si también se pregunta la residencia).
 * `residence` = la respuesta de residencia ya dada ("" si aún no).
 */
export function isQuestionVisible(id: QuestionId, configured: QuestionConfig[], residence: string): boolean {
  if (id !== "stay") return true;
  const asksResidence = configured.some((q) => q.id === "residence");
  return !asksResidence || residence !== "resident";
}

export type AnswersResult = { ok: true; answers: Answers } | { ok: false; error: string };

/**
 * Valida lo que respondió el visitante contra las preguntas configuradas del local. Se descartan en silencio las respuestas de preguntas que
 * el local no hace, las que no se muestran (estancia de un residente) y los valores que no son opciones del catálogo; falta una obligatoria: error.
 */
export function validateAnswers(configured: QuestionConfig[], raw: Record<string, string | undefined>, locale: "es" | "en" = "es"): AnswersResult {
  const answers: Answers = {};
  const residence = optionValues("residence").includes(raw.residence ?? "") ? (raw.residence as string) : "";
  for (const q of configured) {
    if (!isQuestionVisible(q.id, configured, residence)) continue;
    const v = (raw[q.id] ?? "").trim();
    if (v && optionValues(q.id).includes(v)) answers[q.id] = v;
    else if (q.mode === "required") {
      const name = QUESTIONS[q.id].label[locale];
      return { ok: false, error: locale === "en" ? `Please answer: ${name}` : `Responde: ${name}` };
    }
  }
  return { ok: true, answers };
}

/** Respuestas guardadas (jsonb) a un objeto limpio: solo preguntas y valores válidos del catálogo. */
export function cleanAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const id of QUESTION_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "string" && optionValues(id).includes(v)) out[id] = v;
  }
  return out;
}

/** Texto de una respuesta (para el panel y el CSV). */
export function answerLabel(id: QuestionId, value: string | undefined, locale: "es" | "en" = "es"): string {
  return QUESTIONS[id].options.find((o) => o.value === value)?.[locale] ?? "";
}

// ---- Público de una promoción según las respuestas ----

export type Audience = { q: QuestionId; in: string[] };

export function parseAudience(raw: unknown): Audience | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { q?: unknown; in?: unknown };
  if (typeof o.q !== "string" || !isQuestionId(o.q) || !Array.isArray(o.in)) return null;
  const valid = optionValues(o.q);
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

export type Breakdown = { id: QuestionId; short: string; total: number; answered: number; rows: { value: string; label: string; count: number }[] };

/** Cuántos visitantes eligieron cada opción de una pregunta (las opciones sin respuestas también salen, con 0). */
export function breakdown(id: QuestionId, profiles: Answers[]): Breakdown {
  const counts = new Map<string, number>();
  let answered = 0;
  for (const p of profiles) {
    const v = p[id];
    if (!v) continue;
    answered++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return {
    id, short: QUESTIONS[id].short, total: profiles.length, answered,
    rows: QUESTIONS[id].options.map((o) => ({ value: o.value, label: o.es, count: counts.get(o.value) ?? 0 })),
  };
}

// ---- Lo que ve el visitante ----

export type QuestionUi = { id: QuestionId; label: string; required: boolean; options: { value: string; label: string }[] };

/** Las preguntas configuradas del local, ya con los textos en el idioma del visitante. */
export function questionUi(configured: QuestionConfig[], locale: "es" | "en"): QuestionUi[] {
  return configured.map((q) => ({
    id: q.id, label: QUESTIONS[q.id].label[locale], required: q.mode === "required",
    options: QUESTIONS[q.id].options.map((o) => ({ value: o.value, label: o[locale] })),
  }));
}
