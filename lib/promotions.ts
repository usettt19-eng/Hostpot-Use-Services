import { z } from "zod";

// Módulo «Promociones». Función pura: validación, segmentos y elección de la campaña que ve cada visitante.
// El contenido nunca lleva HTML, CSS ni JS libres: solo texto, una imagen verificada y un enlace https://.

export const SEGMENTS = ["all", "new", "returning", "inactive"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABEL: Record<Segment, string> = {
  all: "Todos los visitantes",
  new: "Visitantes nuevos (primera vez)",
  returning: "Visitantes recurrentes",
  inactive: "Visitantes que vuelven tras una ausencia",
};
export const STATUSES = ["draft", "active", "paused"] as const;
export type PromoStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<PromoStatus, string> = { draft: "Borrador", active: "Activa", paused: "Pausada" };

/** Solo https:// sin credenciales. Vacío = sin enlace. */
const httpsUrl = z.string().trim().max(300).refine((v) => {
  if (v === "") return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}, "El enlace debe empezar con https://");

const assetName = z.string().regex(/^[0-9a-f]{16}\.(png|jpg|webp)$/).nullable();

export const contentSchema = z.object({
  title: z.string().trim().min(1, "Escribe el título").max(80, "El título admite hasta 80 caracteres"),
  body: z.string().trim().max(300, "El texto admite hasta 300 caracteres"),
  cta_label: z.string().trim().max(30, "El botón admite hasta 30 caracteres"),
  cta_url: httpsUrl,
  image: assetName,
}).refine((c) => c.cta_url === "" || c.cta_label !== "", { path: ["cta_label"], message: "El botón necesita texto" });

export type PromoContent = z.infer<typeof contentSchema>;

export const promotionSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(80, "El nombre admite hasta 80 caracteres"),
  segment: z.enum(SEGMENTS),
  inactive_days: z.number().int().min(7, "Mínimo 7 días").max(365, "Máximo 365 días"),
  content: contentSchema,
  starts_at: z.string().datetime().nullable(),
  ends_at: z.string().datetime().nullable(),
}).refine((p) => !p.starts_at || !p.ends_at || Date.parse(p.ends_at) > Date.parse(p.starts_at), {
  path: ["ends_at"], message: "La fecha de fin debe ser posterior a la de inicio",
});

export type PromotionInput = z.infer<typeof promotionSchema>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parsePromotion(raw: unknown): ParseResult<PromotionInput> {
  const r = promotionSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "Datos no válidos" };
}

/** El contenido guardado se revalida al leerlo; si no es válido, la campaña no se muestra. */
export function parseContent(raw: unknown): PromoContent | null {
  const r = contentSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ---- Fechas: el formulario usa hora de Panamá (UTC-5, sin horario de verano) ----

const PANAMA_OFFSET_MS = 5 * 3_600_000;

/** «2026-10-24T18:30» (hora de Panamá) a ISO UTC. Vacío = sin fecha; inválido = undefined. */
export function panamaLocalToIso(v: string): string | null | undefined {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return undefined;
  const ms = Date.parse(`${t}:00Z`) + PANAMA_OFFSET_MS;
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/** ISO UTC a «YYYY-MM-DDTHH:mm» en hora de Panamá, para el campo del formulario. */
export function isoToPanamaLocal(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : new Date(ms - PANAMA_OFFSET_MS).toISOString().slice(0, 16);
}

// ---- Qué campaña ve cada visitante ----

export type GuestHistory = { visitCount: number; lastSeenBefore: Date | null };

/** ¿El visitante entra en este segmento? `visitCount` ya incluye la visita actual. */
export function inSegment(segment: Segment, g: GuestHistory, inactiveDays: number, now: Date): boolean {
  const first = g.visitCount <= 1;
  switch (segment) {
    case "all": return true;
    case "new": return first;
    case "returning": return !first;
    case "inactive": {
      if (first || !g.lastSeenBefore) return false;
      return now.getTime() - g.lastSeenBefore.getTime() >= inactiveDays * 86_400_000;
    }
  }
}

export type PromoCandidate = {
  id: string; status: string; segment: Segment; inactive_days: number;
  starts_at: string | null; ends_at: string | null; created_at: string; content: unknown;
};

/** Más específica primero: quien vuelve tras una ausencia ve esa campaña antes que la de «recurrentes». */
const PRIORITY: Record<Segment, number> = { inactive: 3, returning: 2, new: 2, all: 1 };

/** Elige la campaña activa y vigente que corresponde al visitante (la más específica; a igualdad, la más reciente). */
export function pickPromotion<T extends PromoCandidate>(list: T[], g: GuestHistory, now: Date): T | null {
  const t = now.getTime();
  const ok = list.filter((p) =>
    p.status === "active" &&
    (!p.starts_at || Date.parse(p.starts_at) <= t) && (!p.ends_at || Date.parse(p.ends_at) > t) &&
    parseContent(p.content) !== null &&
    inSegment(p.segment, g, p.inactive_days, now));
  ok.sort((a, b) => PRIORITY[b.segment] - PRIORITY[a.segment] || Date.parse(b.created_at) - Date.parse(a.created_at));
  return ok[0] ?? null;
}

/** Página de la campaña que se abre al pulsar «Conectarme»; `token` es el pedido cifrado (ver promo-token.ts). */
export function promoPageUrl(origin: string, slug: string, id: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/w/${encodeURIComponent(slug)}/promo/${id}?${new URLSearchParams({ t: token }).toString()}`;
}

/** Porcentaje de clics sobre impresiones, con un decimal; «—» si aún no hay impresiones. */
export function ctrText(impressions: number, clicks: number): string {
  return impressions > 0 ? `${((clicks / impressions) * 100).toFixed(1)} %` : "—";
}

// ---- Sitios de los botones (lista blanca del Hotspot) ----

const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** Dominio del enlace de un botón (minúsculas, sin «www.»), o null si no es un dominio normal (IP, puerto raro, etc.). */
export function ctaHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return HOST_RE.test(h) ? h : null;
  } catch {
    return null;
  }
}

/** Sitios (sin repetir) de los botones de las campañas activas y con contenido válido. */
export function activeCtaHosts(list: { status: string; content: unknown }[]): string[] {
  const out = new Set<string>();
  for (const p of list) {
    if (p.status !== "active") continue;
    const c = parseContent(p.content);
    const h = c?.cta_url ? ctaHost(c.cta_url) : null;
    if (h) out.add(h);
  }
  return [...out].sort();
}
