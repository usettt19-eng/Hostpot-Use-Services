"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { blindIndex, decryptSecret, encryptSecret } from "@/lib/crypto";
import { getPublishedPortal, getTenantBySlug, requireAdminTenant } from "@/lib/portal";
import { connectGuest, type FlowDb, type RouterApi } from "@/lib/guest-flow";
import { createGuestUser, findHostByAddress, isConfigured, syncBandwidthProfileSafe } from "@/lib/mikrotik";
import { DEFAULT_ROLE, type EstablishmentType } from "@/lib/roles";
import { pickLocale } from "@/lib/portal-settings";
import { minutesOpenLeft, nextOpeningText, type Window } from "@/lib/schedule";
import { allow } from "@/lib/rate-limit";
import { selectPlans, tuningOf } from "@/lib/plans";
import { VISITOR_LIST } from "@/lib/isolation";
import { isTenantSuspended } from "@/lib/tenant-status";
import { moduleEnabled } from "@/lib/tenant-modules";
import { pickPromotion, promoPageUrl, type PromoCandidate } from "@/lib/promotions";
import { siteOrigin } from "@/lib/site-url";
import { sealPromoTicket } from "@/lib/promo-token";

export type GuestState = { error?: string; redirect?: string; simulated?: boolean } | null;

const s = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? "").slice(0, max);

function makeDb(): FlowDb {
  const db = createAdminClient();
  return {
    async countSessions(tenantId, sinceIso, ip) {
      let q = db.from("guest_sessions").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).gte("started_at", sinceIso);
      if (ip) q = q.eq("ip", ip);
      const { count } = await q;
      return count ?? 0;
    },
    async upsertGuest(tenantId, g) {
      const find = () => db.from("guests").select("id, visit_count, last_seen_at")
        .eq("tenant_id", tenantId).eq("email_hash", g.emailHash).maybeSingle();
      let { data } = await find();
      if (!data) {
        const ins = await db.from("guests").insert({
          tenant_id: tenantId, email_hash: g.emailHash, email_enc: g.emailEnc,
          full_name: g.fullName, phone_enc: g.phoneEnc,
        }).select("id").single();
        if (ins.data) return { id: ins.data.id, visitCount: 1, lastSeenBefore: null };
        ({ data } = await find()); // otra petición lo creó a la vez
        if (!data) throw new Error("No se pudo guardar al invitado");
      }
      await db.from("guests").update({
        visit_count: data.visit_count + 1, last_seen_at: new Date().toISOString(),
        ...(g.fullName ? { full_name: g.fullName } : {}), ...(g.phoneEnc ? { phone_enc: g.phoneEnc } : {}),
      }).eq("id", data.id);
      return { id: data.id, visitCount: data.visit_count + 1, lastSeenBefore: data.last_seen_at ? new Date(data.last_seen_at) : null };
    },
    async insertConsents(rows) {
      const { error } = await db.from("guest_consents").insert(rows);
      if (error) throw new Error("No se pudo guardar el consentimiento");
    },
    async insertSession(row) {
      const { data, error } = await db.from("guest_sessions").insert(row).select("id").single();
      if (error || !data) throw new Error("No se pudo guardar la sesión");
      return data.id;
    },
    async updateSession(id, patch) {
      await db.from("guest_sessions").update(patch).eq("id", id);
    },
  };
}

/** Acción pública del portal del invitado: valida, comprueba el dispositivo en el router y crea el acceso. */
export async function guestConnect(_: GuestState, fd: FormData): Promise<GuestState> {
  const tenant = await getTenantBySlug(s(fd, "slug", 80));
  if (!tenant) return { error: "Establecimiento no encontrado" };
  const h = await headers();

  // Límite de intentos ANTES de tocar el router: sin esto, peticiones con IP/MAC falsas (que no crean sesión)
  // harían consultas ilimitadas al router. nginx fija x-real-ip con la IP real; todos los visitantes de un local
  // comparten la IP pública, por eso el límite por IP es holgado.
  const clientIp = h.get("x-real-ip") ?? "desconocida";
  if (!allow(`ip:${clientIp}`, 30, 60_000) || !allow(`tenant:${tenant.id}`, 120, 60_000)) {
    return { error: "Demasiados intentos. Espera un minuto y vuelve a intentarlo" };
  }

  if (await isTenantSuspended(tenant.id)) return { error: "El servicio WiFi de este local no está disponible por ahora" };

  const { settings, termsVersion } = await getPublishedPortal(tenant.id, tenant.name);
  const locale = pickLocale(s(fd, "locale", 2), null, settings.default_locale);

  const cfg = await getRouterConfig(tenant.id);

  // Plan de red del invitado: el perfil del rol de menor privilegio del tipo de establecimiento
  const role = DEFAULT_ROLE[tenant.type as EstablishmentType] ?? "student";
  const [plan] = await selectPlans((cols) => createAdminClient()
    .from("bandwidth_profiles").select(cols).eq("tenant_id", tenant.id).eq("role", role));
  if (!plan) return { error: "Este local no tiene un plan de red configurado" };

  const router: RouterApi | null = isConfigured(cfg)
    ? {
        findHost: (ip) => findHostByAddress(cfg, ip),
        // Se reenvían los dispositivos, el mínimo y la ráfaga del plan para no pisar lo que configuró el administrador
        ensureProfile: async (name, d, u) => { await syncBandwidthProfileSafe(cfg, name, d, u, { ...tuningOf(plan), addressList: VISITOR_LIST }); },
        createGuestUser: (u) => createGuestUser(cfg, u),
      }
    : null;

  // Escuelas: el acceso del visitante sigue el horario configurado (si lo hay)
  let schedule: { openLeft: number | null; nextText: string | null } | undefined;
  if (tenant.type === "school") {
    const { data: rows } = await createAdminClient()
      .from("access_windows").select("weekday, start_min, end_min").eq("tenant_id", tenant.id);
    if (rows?.length) {
      const windows: Window[] = rows.map((r) => ({ weekday: r.weekday, start: r.start_min, end: r.end_min }));
      const now = new Date();
      schedule = { openLeft: minutesOpenLeft(windows, now), nextText: nextOpeningText(windows, now) };
    }
  }

  const result = await connectGuest(
    {
      now: () => new Date(), router, db: makeDb(),
      blindIndex, encrypt: encryptSecret,
      randomHex: (n) => randomBytes(n).toString("hex"),
      randomPassword: () => randomBytes(9).toString("base64url"),
      // Módulo Promociones (solo si el dueño lo activó para este establecimiento)
      promo: async (tenantId, guest, ticket) => {
        if (!(await moduleEnabled(tenantId, "promotions"))) return null;
        const { data } = await createAdminClient().from("promotions")
          .select("id, status, segment, inactive_days, starts_at, ends_at, created_at, content")
          .eq("tenant_id", tenantId).eq("status", "active");
        const picked = pickPromotion((data ?? []) as PromoCandidate[], guest, new Date());
        if (!picked) return null;
        const token = sealPromoTicket({ tenantId, promoId: picked.id, ...ticket }, { encrypt: encryptSecret, decrypt: decryptSecret }, Date.now());
        return promoPageUrl(siteOrigin(h), tenant.slug, picked.id, token);
      },
    },
    {
      schedule,
      tenantId: tenant.id, settings, termsVersion,
      termsText: settings.terms[locale].trim() || settings.terms[settings.default_locale].trim(),
      plan: { name: plan.name, downloadKbps: plan.download_kbps, uploadKbps: plan.upload_kbps },
      form: {
        email: s(fd, "email", 300), name: s(fd, "name", 200), phone: s(fd, "phone", 50),
        acceptTerms: fd.get("accept_terms") === "on", acceptMarketing: fd.get("accept_marketing") === "on",
      },
      hs: { mac: s(fd, "hs_mac", 40), ip: s(fd, "hs_ip", 40), login: s(fd, "hs_login", 300), orig: s(fd, "hs_orig", 600) },
      userAgent: h.get("user-agent") ?? "",
    }
  ).catch((e) => {
    console.error("guestConnect:", e instanceof Error ? e.message : "error");
    return { ok: false as const, error: "No se pudo completar la conexión. Inténtalo de nuevo" };
  });

  if (!result.ok) return { error: result.error };
  return "simulated" in result ? { simulated: true } : { redirect: result.redirect };
}

/** Derecho de supresión: borra al invitado y, por cascada, sus consentimientos y sesiones. */
export async function deleteGuest(fd: FormData) {
  const ctx = await requireAdminTenant();
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await createAdminClient().from("guests").delete().eq("id", id).eq("tenant_id", ctx.tenantId);
  revalidatePath("/admin/guests");
}
