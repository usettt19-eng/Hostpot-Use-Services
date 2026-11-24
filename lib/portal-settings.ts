import { z } from "zod";
import {
  TEMPLATES, RADII, FONTS, LOCALES, METHODS, FIELD_MODES, contrastRatio, MIN_CONTRAST,
} from "./portal-theme.ts";
import { CUSTOM_IDS, CUSTOM_LIMITS, MAX_QUESTIONS, QUESTION_IDS, QUESTION_MODES, checkCustomQuestion } from "./guest-questions.ts";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (use #RRGGBB)");

/** Solo https://. Vacío significa "sin enlace". */
const httpsUrl = z.string().max(300).refine((v) => {
  if (v === "") return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}, "La URL debe empezar con https://");

const texts = z.object({
  title: z.string().trim().max(80),
  subtitle: z.string().trim().max(200),
  button: z.string().trim().min(1, "El botón necesita texto").max(30),
  footer: z.string().trim().max(200),
});

/** Pregunta propia del local: texto y 2 a 6 opciones cerradas (sin texto libre ni temas delicados; ver checkCustomQuestion). */
const customQuestionSchema = z.object({
  id: z.enum(CUSTOM_IDS),
  label: z.object({ es: z.string().max(CUSTOM_LIMITS.label * 2), en: z.string().max(CUSTOM_LIMITS.label * 2) }),
  options: z.array(z.object({ value: z.string().regex(/^o[1-6]$/), es: z.string().max(CUSTOM_LIMITS.option * 2), en: z.string().max(CUSTOM_LIMITS.option * 2) })).max(CUSTOM_LIMITS.maxOptions),
}).superRefine((c, ctx) => {
  const r = checkCustomQuestion(c);
  if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
});

const assetName = z.string().regex(/^[0-9a-f]{16}\.(png|jpg|webp)$/).nullable();
const fieldMode = z.enum(FIELD_MODES);

export const portalSettingsSchema = z.object({
  template: z.enum(TEMPLATES),
  display_name: z.string().trim().min(1, "Falta el nombre visible").max(60),
  default_locale: z.enum(LOCALES),
  colors: z.object({ primary: hex, accent: hex, text: hex, background: hex }),
  radius: z.enum(RADII),
  font: z.enum(FONTS),
  texts: z.object({ es: texts, en: texts }),
  methods: z.array(z.enum(METHODS)).min(1, "Active al menos un método de acceso").max(METHODS.length)
    .refine((m) => new Set(m).size === m.length, "Métodos repetidos"),
  fields: z.object({ name: fieldMode, email: fieldMode, phone: fieldMode }),
  session_minutes: z.number().int().min(10, "Mínimo 10 minutos").max(1440, "Máximo 24 horas").default(120),
  /** Pide un código enviado al correo antes de conectar (requiere el correo configurado en el servidor). */
  verify_email: z.boolean().default(false),
  /** Preguntas opcionales al visitante (módulo «Preguntas al visitante»; catálogo fijo, máximo 3, sin repetir). */
  questions: z.array(z.object({ id: z.enum([...QUESTION_IDS, ...CUSTOM_IDS]), mode: z.enum(QUESTION_MODES) })).max(MAX_QUESTIONS, `Máximo ${MAX_QUESTIONS} preguntas activas`)
    .refine((q) => new Set(q.map((x) => x.id)).size === q.length, "Preguntas repetidas").default([]),
  /** Preguntas propias del local (hasta 3). Una definida pero no activa en `questions` no se muestra. */
  custom_questions: z.array(customQuestionSchema).max(CUSTOM_IDS.length)
    .refine((q) => new Set(q.map((x) => x.id)).size === q.length, "Preguntas propias repetidas").default([]),
  redirect_url: httpsUrl,
  privacy_url: httpsUrl,
  terms: z.object({ es: z.string().max(8000), en: z.string().max(8000) }),
  assets: z.object({ logo: assetName, background: assetName }),
}).superRefine((s, ctx) => {
  // Una pregunta propia activa debe estar definida
  for (const q of s.questions) {
    if ((CUSTOM_IDS as readonly string[]).includes(q.id) && !s.custom_questions.some((c) => c.id === q.id)) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: `Pregunta propia ${q.id.slice(-1)} activa pero sin definir: escribe el texto y las opciones` });
    }
  }
});

export type PortalSettings = z.infer<typeof portalSettingsSchema>;

export function defaultSettings(name: string): PortalSettings {
  return {
    template: "card",
    display_name: name.slice(0, 60) || "WiFi",
    default_locale: "es",
    colors: { primary: "#1d4ed8", accent: "#0ea5e9", text: "#111827", background: "#ffffff" },
    radius: "md",
    font: "system",
    texts: {
      es: { title: `Bienvenido a ${name}`.slice(0, 80), subtitle: "Conéctate a nuestra red WiFi", button: "Conectarme", footer: "" },
      en: { title: `Welcome to ${name}`.slice(0, 80), subtitle: "Connect to our WiFi network", button: "Connect", footer: "" },
    },
    methods: ["email"],
    fields: { name: "optional", email: "required", phone: "off" },
    session_minutes: 120,
    verify_email: false,
    questions: [],
    custom_questions: [],
    redirect_url: "",
    privacy_url: "",
    terms: { es: "", en: "" },
    assets: { logo: null, background: null },
  };
}

export type ParseResult = { ok: true; data: PortalSettings } | { ok: false; errors: string[] };

export function parseSettings(raw: unknown): ParseResult {
  const r = portalSettingsSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "ajustes"}: ${i.message}`) };
}

/** Problemas que impiden publicar (los borradores sí se pueden guardar con ellos). */
export function publishProblems(s: PortalSettings): string[] {
  const out: string[] = [];
  const ratio = contrastRatio(s.colors.text, s.colors.background);
  if (ratio < MIN_CONTRAST) {
    out.push(`El texto casi no se lee sobre el fondo (contraste ${ratio.toFixed(1)}:1; mínimo ${MIN_CONTRAST}:1)`);
  }
  if (s.terms[s.default_locale].trim().length < 20) {
    out.push("Escribe los términos y condiciones en el idioma por defecto antes de publicar");
  }
  return out;
}

// ---- Imágenes ----

export type ImageKind = "png" | "jpg" | "webp";

/** Detecta el tipo real por los primeros bytes (no confía en el nombre ni en el tipo declarado). */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

export const IMAGE_MIME: Record<ImageKind, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
export const MAX_IMAGE_BYTES = { logo: 512 * 1024, background: 1024 * 1024 } as const;
export const ASSET_NAME_RE = /^[0-9a-f]{16}\.(png|jpg|webp)$/;

/** Idioma: ?lang= válido, si no el del navegador, si no el por defecto. */
export function pickLocale(requested: string | undefined, acceptLanguage: string | null, fallback: "es" | "en"): "es" | "en" {
  if (requested === "es" || requested === "en") return requested;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return first === "es" || first === "en" ? first : fallback;
}
