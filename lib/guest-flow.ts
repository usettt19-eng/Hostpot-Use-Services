import { createHash } from "node:crypto";
import type { PortalSettings } from "./portal-settings.ts";
import type { GuestHistory } from "./promotions.ts";
import {
  buildLoginRedirect, isIPv4, isMac, isValidEmail, normalizeEmail, normalizeMac, normalizePhone, parseLoginUrl, routerDuration, sanitizeOrig,
} from "./guest-utils.ts";

// Lógica del acceso de invitados, con las dependencias inyectadas para poder probarla sin red ni base de datos.

export type HostInfo = { mac: string; authorized: boolean; bypassed: boolean; server: string };

export type RouterApi = {
  findHost(ip: string): Promise<HostInfo | null>;
  ensureProfile(name: string, downloadKbps: number, uploadKbps: number): Promise<void>;
  createGuestUser(u: { name: string; password: string; profile: string; limitUptime: string; comment: string }): Promise<void>;
};

export type ConsentRow = {
  tenant_id: string; guest_id: string; kind: "terms" | "marketing"; granted: boolean;
  text_version: number | null; text_hash: string | null; user_agent: string | null;
};
export type SessionRow = {
  tenant_id: string; guest_id: string; hotspot_username: string; mac_hmac: string; ip: string;
  method: string; terms_version: number;
};

export type FlowDb = {
  countSessions(tenantId: string, sinceIso: string, ip?: string): Promise<number>;
  /** `visitCount` ya cuenta la visita actual; `lastSeenBefore` es la visita anterior (null si es la primera). */
  upsertGuest(tenantId: string, g: { emailHash: string; emailEnc: string; fullName: string | null; phoneEnc: string | null }): Promise<{ id: string; visitCount?: number; lastSeenBefore?: Date | null }>;
  insertConsents(rows: ConsentRow[]): Promise<void>;
  insertSession(row: SessionRow): Promise<string>;
  updateSession(id: string, patch: { status: "pending" | "active" | "ended" | "failed" }): Promise<void>;
};

export type FlowDeps = {
  now: () => Date;
  router: RouterApi | null; // null: el establecimiento no tiene router configurado
  db: FlowDb;
  blindIndex(scope: string, value: string): string;
  encrypt(value: string): string;
  randomHex(bytes: number): string;
  randomPassword(): string;
  /**
   * Módulo Promociones: página de la campaña que le toca al visitante, o null si no hay. Se le muestra ANTES de darle internet
   * (así el teléfono no cierra la ventana del portal): la conexión real ocurre al pulsar un botón de esa página, y para eso
   * recibe el acceso ya creado. Si falla, se ignora y se conecta como siempre.
   */
  promo?(tenantId: string, guest: GuestHistory, ticket: { login: string; username: string; password: string; next: string }): Promise<string | null>;
};

export type FlowInput = {
  // Horario de acceso (solo escuelas). openLeft: minutos que quedan de la ventana abierta, o null si está cerrada.
  schedule?: { openLeft: number | null; nextText: string | null };
  tenantId: string;
  settings: PortalSettings;
  termsVersion: number;
  termsText: string;
  plan: { name: string; downloadKbps: number; uploadKbps: number };
  form: { email: string; name: string; phone: string; acceptTerms: boolean; acceptMarketing: boolean };
  hs: { mac: string; ip: string; login: string; orig: string };
  userAgent: string;
};

export type FlowResult =
  | { ok: true; simulated: true }
  | { ok: true; redirect: string }
  | { ok: false; error: string };

const fail = (error: string): FlowResult => ({ ok: false, error });

const LIMIT_PER_IP_PER_MIN = 3;
const LIMIT_PER_TENANT_PER_MIN = 60;

export async function connectGuest(deps: FlowDeps, input: FlowInput): Promise<FlowResult> {
  const { settings: st, form, hs } = input;

  // Sin datos del Hotspot es la vista previa del portal: no se hace nada real
  if (!hs.ip && !hs.mac && !hs.login) return { ok: true, simulated: true };

  const mac = normalizeMac(hs.mac);
  const login = parseLoginUrl(hs.login);
  if (!isIPv4(hs.ip) || !isMac(mac) || !login) {
    return fail("Abre este portal desde la red WiFi del local para conectarte");
  }

  if (!form.acceptTerms) return fail("Debes aceptar los términos y condiciones");
  if (!st.methods.includes("email")) return fail("El acceso por correo no está activo en este local");

  const email = normalizeEmail(form.email);
  if (!isValidEmail(email)) return fail("Escribe un correo válido");

  const name = form.name.trim().slice(0, 100);
  if (st.fields.name === "required" && !name) return fail("Escribe tu nombre");
  const phone = normalizePhone(form.phone);
  if (st.fields.phone === "required" && !phone) return fail("Escribe un teléfono válido");

  if (!deps.router) return fail("Este local todavía no tiene el router configurado");

  // Horario: fuera de la ventana no hay acceso, y dentro el acceso dura hasta que cierre
  if (input.schedule && input.schedule.openLeft === null) {
    return fail(input.schedule.nextText
      ? `Fuera del horario de acceso. Podrás conectarte ${input.schedule.nextText}`
      : "Fuera del horario de acceso");
  }

  // Límites de uso (una sola IP no puede crear sesiones sin parar; el local tampoco)
  const since = new Date(deps.now().getTime() - 60_000).toISOString();
  if ((await deps.db.countSessions(input.tenantId, since, hs.ip)) >= LIMIT_PER_IP_PER_MIN ||
      (await deps.db.countSessions(input.tenantId, since)) >= LIMIT_PER_TENANT_PER_MIN) {
    return fail("Demasiados intentos. Espera un minuto y vuelve a intentarlo");
  }

  // La MAC y la IP vienen de la URL: se comprueban contra el router
  let host: HostInfo | null;
  try {
    host = await deps.router.findHost(hs.ip);
  } catch {
    return fail("No se pudo contactar al router. Inténtalo de nuevo en un momento");
  }
  if (!host || host.mac !== mac) {
    return fail("No reconocimos tu dispositivo en la red del local. Desconéctate, vuelve a conectarte y prueba de nuevo");
  }
  const dst = st.redirect_url || sanitizeOrig(hs.orig);
  if (host.authorized || host.bypassed) return { ok: true, redirect: dst || login.replace(/\/login$/, "/status") };

  // Persona, consentimientos y sesión
  const { id: guestId, visitCount, lastSeenBefore } = await deps.db.upsertGuest(input.tenantId, {
    emailHash: deps.blindIndex(input.tenantId, email),
    emailEnc: deps.encrypt(email),
    fullName: name || null,
    phoneEnc: phone ? deps.encrypt(phone) : null,
  });
  const ua = input.userAgent.slice(0, 200) || null;
  await deps.db.insertConsents([
    { tenant_id: input.tenantId, guest_id: guestId, kind: "terms", granted: true, text_version: input.termsVersion,
      text_hash: createHash("sha256").update(input.termsText).digest("hex"), user_agent: ua },
    { tenant_id: input.tenantId, guest_id: guestId, kind: "marketing", granted: form.acceptMarketing,
      text_version: null, text_hash: null, user_agent: ua },
  ]);

  const username = `g_${deps.randomHex(5)}`;
  const password = deps.randomPassword();
  const sessionId = await deps.db.insertSession({
    tenant_id: input.tenantId, guest_id: guestId, hotspot_username: username,
    mac_hmac: deps.blindIndex(input.tenantId, mac), ip: hs.ip, method: "email", terms_version: input.termsVersion,
  });

  try {
    await deps.router.ensureProfile(input.plan.name, input.plan.downloadKbps, input.plan.uploadKbps);
    await deps.router.createGuestUser({
      name: username, password, profile: input.plan.name,
      limitUptime: routerDuration(Math.min(st.session_minutes, input.schedule?.openLeft ?? Infinity)),
      comment: `guest:${sessionId}`,
    });
  } catch {
    await deps.db.updateSession(sessionId, { status: "failed" });
    return fail("No se pudo crear tu acceso. Inténtalo de nuevo en un momento");
  }

  // Redirección de nivel superior (GET) al login del Hotspot con la credencial de un solo uso
  // Con el módulo Promociones, el visitante pasa primero por su campaña; un fallo aquí nunca impide conectar
  if (deps.promo) {
    try {
      const page = await deps.promo(input.tenantId, { visitCount: visitCount ?? 1, lastSeenBefore: lastSeenBefore ?? null }, { login, username, password, next: dst });
      if (page) return { ok: true, redirect: page };
    } catch {
      // se conecta sin campaña
    }
  }
  return { ok: true, redirect: buildLoginRedirect(login, username, password, dst) };
}
