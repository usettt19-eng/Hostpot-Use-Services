"use server";

import { randomBytes } from "node:crypto";
import { resolve4 } from "node:dns/promises";
import { headers } from "next/headers";
import { requireAdminTenant } from "@/lib/portal";
import { buildRouterScript, toRsc, type ScriptBlock } from "@/lib/router-script";

export type RouterScriptState = {
  error?: string; blocks?: ScriptBlock[]; rsc?: string; filename?: string; password?: string; generated?: boolean;
} | null;

const f = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Genera las instrucciones del router de este establecimiento. La contraseña no se guarda: se muestra una vez. */
export async function generateRouterScript(_: RouterScriptState, fd: FormData): Promise<RouterScriptState> {
  const ctx = await requireAdminTenant();
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
