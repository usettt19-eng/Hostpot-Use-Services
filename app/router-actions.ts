"use server";

import { randomBytes } from "node:crypto";
import { resolve4 } from "node:dns/promises";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient, getRouterConfig } from "@/lib/supabase";
import { encryptSecret } from "@/lib/crypto";
import { validateRouterInput } from "@/lib/router-config";
import { isConfigured, syncBandwidthProfile, testConnection } from "@/lib/mikrotik";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { buildRouterScript, toRsc, type ScriptBlock } from "@/lib/router-script";

export type RouterScriptState = {
  error?: string; blocks?: ScriptBlock[]; rsc?: string; filename?: string; password?: string; generated?: boolean;
} | null;

const f = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** El dueño de la plataforma genera las instrucciones del router de un establecimiento. La contraseña no se guarda: se muestra una vez. */
export async function generateRouterScript(_: RouterScriptState, fd: FormData): Promise<RouterScriptState> {
  await requirePlatformAdmin();
  const { data: t } = await createAdminClient()
    .from("tenants").select("name, slug").eq("id", f(fd, "tenant_id")).maybeSingle();
  if (!t) return { error: "Establecimiento no encontrado" };
  const ctx = { slug: t.slug as string, tenantName: t.name as string };
  const h = await headers();
  const portalHost = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
  let portalIp = "";
  try { portalIp = (await resolve4(portalHost))[0] ?? ""; } catch { /* sin regla por IP si no se resuelve */ }

  const typed = f(fd, "rest_password");
  const generated = !typed;
  const password = typed || randomBytes(15).toString("base64url").replace(/[^A-Za-z0-9]/g, "a").slice(0, 20);
  const wg = fd.get("use_wg") === "on"
    ? { serverPublicKey: f(fd, "wg_key"), endpoint: f(fd, "wg_endpoint"), routerAddress: f(fd, "wg_router"), serverAddress: f(fd, "wg_server") }
    : null;

  const r = buildRouterScript({
    slug: ctx.slug, portalHost, portalIp,
    hotspotInterface: f(fd, "iface"), network: f(fd, "network"), restPassword: password, wg,
  });
  if (!r.ok) return { error: r.error };
  return {
    blocks: r.blocks, generated, password,
    rsc: toRsc(r.blocks, `Configuración del router de ${ctx.tenantName} (${ctx.slug})`),
    filename: `router-${ctx.slug}.rsc`,
  };
}

export type RouterConnState = { error?: string; ok?: string; warn?: string } | null;

/**
 * El dueño guarda la conexión del portal con el router de un establecimiento, la prueba y sube sus perfiles de velocidad.
 * Sin contraseña nueva se conserva la guardada.
 */
export async function saveTenantRouter(_: RouterConnState, fd: FormData): Promise<RouterConnState> {
  await requirePlatformAdmin();
  const id = f(fd, "tenant_id");
  const db = createAdminClient();
  const { data: t } = await db.from("tenants").select("id").eq("id", id).maybeSingle();
  if (!t) return { error: "Establecimiento no encontrado" };
  const { data: cur } = await db.from("tenant_router_credentials").select("router_password_enc").eq("tenant_id", id).maybeSingle();

  const v = validateRouterInput({
    url: f(fd, "router_url"), user: f(fd, "router_user"), password: String(fd.get("router_password") ?? ""),
    fingerprint: f(fd, "router_cert_fingerprint"), hasPassword: !!cur?.router_password_enc,
  });
  if (!v.ok) return { error: v.error };

  const patch: Record<string, string | null> = {
    tenant_id: id, router_url: v.url, router_user: v.user, router_cert_fingerprint: v.fingerprint, updated_at: new Date().toISOString(),
  };
  if (v.password) patch.router_password_enc = encryptSecret(v.password);
  const { error } = await db.from("tenant_router_credentials").upsert(patch, { onConflict: "tenant_id" });
  if (error) {
    console.error("saveTenantRouter:", error.message);
    return { error: "No se pudo guardar la conexión del router" };
  }
  revalidatePath(`/platform/router/${id}`);

  // Probar y, si responde, subir los perfiles de velocidad del establecimiento
  const cfg = await getRouterConfig(id);
  if (!isConfigured(cfg)) return { error: "Los datos se guardaron pero la conexión quedó incompleta" };
  let info: { board: string; version: string };
  try {
    info = await testConnection(cfg);
  } catch (e) {
    return { warn: `Guardado, pero el router no respondió: ${e instanceof Error ? e.message : "error"}. Revisa el túnel, la URL, el usuario y la huella.` };
  }
  const { data: plans } = await db.from("bandwidth_profiles").select("name, download_kbps, upload_kbps").eq("tenant_id", id);
  let synced = 0;
  for (const p of plans ?? []) {
    try { await syncBandwidthProfile(cfg, p.name, p.download_kbps, p.upload_kbps); synced++; } catch (e) {
      console.error("saveTenantRouter perfil:", e instanceof Error ? e.message : "error");
    }
  }
  return { ok: `Conectado: ${info.board}, RouterOS ${info.version}. Perfiles de velocidad subidos: ${synced} de ${plans?.length ?? 0}.` };
}
