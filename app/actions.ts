"use server";

import { isTenantSuspended } from "@/lib/tenant-status";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient, getRouterConfig } from "@/lib/supabase";
import { encryptSecret } from "@/lib/crypto";
import { uniqueUsername } from "@/lib/usernames";
import { createUserAccount } from "@/lib/create-user";
import {
  createHotspotUser,
  deleteHotspotUser,
  setHotspotUserDisabled,
  syncBandwidthProfile,
  normalizeFingerprint,
  isConfigured,
  listHotspotUserNames,
} from "@/lib/mikrotik";
import { isAdminRole, isEstablishmentType, rolesFor, DEFAULT_ROLE, type EstablishmentType } from "@/lib/roles";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* ---------- Auth ---------- */

export async function login(_: unknown, fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email")),
    password: String(fd.get("password")),
  });
  if (error) return { error: "Correo o contraseña incorrectos" };
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Datos públicos mínimos de un establecimiento por su código (para adaptar el formulario de registro). */
export async function lookupEstablishment(code: string) {
  const { data } = await createAdminClient()
    .from("tenants").select("name, type").eq("slug", slugify(code)).maybeSingle();
  return data ? { name: data.name as string, type: data.type as EstablishmentType, roles: [...rolesFor(data.type)] } : null;
}

/** Registro de usuario en un establecimiento existente. Queda 'pending' hasta que un admin lo apruebe. */
export async function register(_: unknown, fd: FormData) {
  const slug = slugify(String(fd.get("school")));
  const role = String(fd.get("role"));

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, type").eq("slug", slug).maybeSingle();
  if (!tenant) return { error: "No existe un establecimiento con ese código" };
  if (!rolesFor(tenant.type).includes(role)) return { error: "Rol inválido para este tipo de establecimiento" };

  const { data, error } = await admin.auth.admin.createUser({
    email: String(fd.get("email")),
    password: String(fd.get("password")),
    email_confirm: true,
  });
  if (error || !data.user) return { error: error?.message ?? "No se pudo crear la cuenta" };

  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id,
    tenant_id: tenant.id,
    full_name: String(fd.get("full_name")),
    requested_role: role,
    role: DEFAULT_ROLE[tenant.type as EstablishmentType], // el rol efectivo lo fija el admin al aprobar
    status: "pending",
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: pErr.message };
  }
  return { ok: "Cuenta creada. Un administrador debe aprobarla antes de que puedas usar la red." };
}

/** Crea un establecimiento nuevo (tenant) y su primer administrador activo. */
export async function registerSchool(_: unknown, fd: FormData) {
  const name = String(fd.get("school_name")).trim();
  const slug = slugify(name);
  const type = String(fd.get("type"));
  if (!slug) return { error: "Nombre de establecimiento inválido" };
  if (!isEstablishmentType(type)) return { error: "Tipo de establecimiento inválido" };

  const admin = createAdminClient();
  const { data: tenant, error: tErr } = await admin.from("tenants").insert({ name, slug, type }).select("id").single();
  if (tErr) return { error: tErr.code === "23505" ? "Ya existe un establecimiento con ese nombre" : tErr.message };

  const { data, error } = await admin.auth.admin.createUser({
    email: String(fd.get("email")),
    password: String(fd.get("password")),
    email_confirm: true,
  });
  if (error || !data.user) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    return { error: error?.message ?? "No se pudo crear la cuenta" };
  }
  await admin.from("profiles").insert({
    id: data.user.id,
    tenant_id: tenant.id,
    full_name: String(fd.get("full_name")),
    requested_role: "superadmin",
    role: "superadmin",
    status: "active",
  });
  return { ok: `Establecimiento creado. Código para registrar usuarios: ${slug}` };
}

/* ---------- Administración ---------- */

async function requireAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles").select("id, tenant_id, role, status").eq("id", auth.user.id).single();
  if (!me || me.status !== "active" || !isAdminRole(me.role)) redirect("/dashboard");
  if (await isTenantSuspended(me.tenant_id)) redirect("/dashboard");
  const tenant = await getRouterConfig(me.tenant_id);
  const { data: est } = await supabase.from("tenants").select("type").eq("id", me.tenant_id).single();
  return { supabase, me, tenant, roles: rolesFor(est?.type ?? "school") };
}

export async function setUserStatus(fd: FormData) {
  const { supabase, me, roles, tenant } = await requireAdmin();
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  const role = String(fd.get("role") ?? "");
  const patch: Record<string, string> = { status };
  if (role && roles.includes(role)) patch.role = role;
  await supabase.from("profiles").update(patch).eq("id", id).eq("tenant_id", me.tenant_id);

  // Una cuenta suspendida no debe conservar el WiFi: se deshabilita su usuario del Hotspot (y se reactiva al volver)
  if (status === "suspended" || status === "active") {
    const { data: hu } = await supabase
      .from("hotspot_users").select("username").eq("profile_id", id).eq("tenant_id", me.tenant_id).maybeSingle();
    if (hu) {
      await setHotspotUserDisabled(tenant, hu.username, status === "suspended").catch((e) =>
        console.error("setUserStatus hotspot:", e instanceof Error ? e.message : "error"));
    }
  }
  revalidatePath("/admin/users");
}

/** Nombres de usuario de Hotspot ya tomados en el establecimiento: los de la base y los que existan en el router. */
async function takenUsernames(
  supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, router: Parameters<typeof isConfigured>[0]
) {
  const { data } = await supabase.from("hotspot_users").select("username").eq("tenant_id", tenantId);
  const taken = new Set((data ?? []).map((r) => r.username.toLowerCase()));
  if (isConfigured(router)) {
    try {
      for (const n of await listHotspotUserNames(router)) taken.add(n);
    } catch {
      /* si el router no responde, la creación en el router fallará por sí sola si hay un choque */
    }
  }
  return taken;
}

/**
 * Aprueba al usuario y le crea su usuario de Hotspot con el perfil de su rol.
 * La contraseña del Hotspot se devuelve una sola vez (no se almacena).
 */
export async function approveUser(_: unknown, fd: FormData): Promise<{ error?: string; username?: string; password?: string }> {
  const { supabase, me, tenant, roles } = await requireAdmin();
  const id = String(fd.get("id"));
  const chosen = String(fd.get("role") ?? "");
  const { data: p } = await supabase
    .from("profiles").select("id, role, requested_role").eq("id", id).eq("tenant_id", me.tenant_id).single();
  if (!p) return { error: "Usuario no encontrado" };
  const role = roles.includes(chosen) ? chosen : roles.includes(p.requested_role) ? p.requested_role : p.role;
  const { data: bw } = await supabase
    .from("bandwidth_profiles").select("name, download_kbps, upload_kbps").eq("tenant_id", me.tenant_id).eq("role", role).single();

  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(id);
  const username = uniqueUsername(u.user?.email ?? id, await takenUsernames(supabase, me.tenant_id, tenant));
  const typed = String(fd.get("hotspot_password") ?? "").trim();
  if (typed && typed.length < 6) return { error: "La contraseña del Hotspot debe tener al menos 6 caracteres" };
  const password = typed || crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  try {
    // El perfil de velocidad debe existir en el router antes de crear el usuario
    if (bw) await syncBandwidthProfile(tenant, bw.name, bw.download_kbps, bw.upload_kbps);
    await createHotspotUser(tenant, username, password, bw?.name ?? role);
  } catch (e) {
    console.error("Hotspot:", e instanceof Error ? e.message : "error");
    return { error: "No se pudo crear el usuario en el router. Intenta de nuevo." };
  }
  await supabase.from("profiles").update({ status: "active", role }).eq("id", id).eq("tenant_id", me.tenant_id);
  await supabase.from("hotspot_users").upsert(
    { tenant_id: me.tenant_id, profile_id: id, username },
    { onConflict: "tenant_id,username" }
  );
  revalidatePath("/admin/users");
  return { username, password };
}

export async function toggleHotspot(fd: FormData) {
  const { supabase, me, tenant } = await requireAdmin();
  const id = String(fd.get("id"));
  const disabled = fd.get("disabled") === "true";
  const { data: hu } = await supabase
    .from("hotspot_users").update({ disabled }).eq("id", id).eq("tenant_id", me.tenant_id).select("username").single();
  if (hu) await setHotspotUserDisabled(tenant, hu.username, disabled).catch(console.error);
  revalidatePath("/admin/users");
}

export async function removeHotspot(fd: FormData) {
  const { supabase, me, tenant } = await requireAdmin();
  const id = String(fd.get("id"));
  const { data: hu } = await supabase
    .from("hotspot_users").delete().eq("id", id).eq("tenant_id", me.tenant_id).select("username").single();
  if (hu) await deleteHotspotUser(tenant, hu.username).catch(console.error);
  revalidatePath("/admin/users");
}

export async function saveBandwidth(fd: FormData) {
  const { supabase, me, tenant } = await requireAdmin();
  const id = String(fd.get("id"));
  const download = Math.max(64, Number(fd.get("download_kbps")));
  const upload = Math.max(64, Number(fd.get("upload_kbps")));
  const { data: bw } = await supabase
    .from("bandwidth_profiles")
    .update({ download_kbps: download, upload_kbps: upload })
    .eq("id", id).eq("tenant_id", me.tenant_id).select("name").single();
  if (bw) await syncBandwidthProfile(tenant, bw.name, download, upload).catch(console.error);
  revalidatePath("/admin/bandwidth");
}

export async function saveRouter(fd: FormData) {
  const { me } = await requireAdmin();
  const pass = String(fd.get("router_password") ?? "");
  const fingerprint = normalizeFingerprint(String(fd.get("router_cert_fingerprint") ?? ""));
  if (fingerprint && fingerprint.length !== 64) {
    throw new Error("La huella SHA-256 debe tener 64 caracteres hexadecimales (32 pares)");
  }
  const patch: Record<string, string | null> = {
    tenant_id: me.tenant_id,
    router_url: String(fd.get("router_url") || "") || null,
    router_user: String(fd.get("router_user") || "") || null,
    router_cert_fingerprint: fingerprint || null,
    updated_at: new Date().toISOString(),
  };
  if (pass) patch.router_password_enc = encryptSecret(pass);
  const { error } = await createAdminClient()
    .from("tenant_router_credentials").upsert(patch, { onConflict: "tenant_id" });
  if (error) {
    console.error("saveRouter:", error.message);
    throw new Error("No se pudo guardar la conexión del router");
  }
  revalidatePath("/admin/bandwidth");
}

/**
 * El administrador crea la cuenta directamente: queda activa, con su usuario de Hotspot, y las credenciales
 * se muestran una sola vez. La cuenta del portal lleva una contraseña aleatoria que no se entrega (la persona
 * usa solo el WiFi). La lógica y el orden de los pasos, con su deshacer, están en `lib/create-user.ts`.
 */
export async function createUser(_: unknown, fd: FormData): Promise<{ error?: string; username?: string; password?: string; name?: string }> {
  const { supabase, me, tenant, roles } = await requireAdmin();
  const admin = createAdminClient();
  const log = (what: string, e: unknown) => console.error(`createUser ${what}:`, e instanceof Error ? e.message : String(e));

  const result = await createUserAccount(
    {
      roles,
      async findPlan(role) {
        const { data } = await supabase.from("bandwidth_profiles").select("name, download_kbps, upload_kbps")
          .eq("tenant_id", me.tenant_id).eq("role", role).single();
        return data ?? null;
      },
      takenUsernames: () => takenUsernames(supabase, me.tenant_id, tenant),
      async createAuthUser(email) {
        const { data, error } = await admin.auth.admin.createUser({
          email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true,
        });
        if (error || !data.user) {
          return { error: /already|registered|exists/i.test(error?.message ?? "") ? "Ya existe una cuenta con ese correo" : "No se pudo crear la cuenta" };
        }
        return { id: data.user.id };
      },
      async deleteAuthUser(id) { await admin.auth.admin.deleteUser(id); },
      async insertProfile(row) {
        const { error } = await admin.from("profiles").insert({
          ...row, tenant_id: me.tenant_id, requested_role: row.role, status: "active",
        });
        if (error) log("perfil", error);
        return error ? error.message : null;
      },
      async deleteProfile(id) { await admin.from("profiles").delete().eq("id", id); },
      router: {
        async ensureProfile(plan) { await syncBandwidthProfile(tenant, plan.name, plan.download_kbps, plan.upload_kbps); },
        async createHotspotUser(u, p, profile) {
          try { await createHotspotUser(tenant, u, p, profile); } catch (e) { log("router", e); throw e; }
        },
        async deleteHotspotUser(u) { await deleteHotspotUser(tenant, u); },
      },
      async insertHotspotUser(row) {
        const { error } = await admin.from("hotspot_users").insert({ ...row, tenant_id: me.tenant_id });
        if (error) log("hotspot_users", error);
        return error ? error.message : null;
      },
      randomPassword: () => crypto.randomUUID().replace(/-/g, "").slice(0, 10),
    },
    {
      fullName: String(fd.get("full_name") ?? ""), email: String(fd.get("email") ?? ""),
      role: String(fd.get("role") ?? ""), hotspotPassword: String(fd.get("hotspot_password") ?? ""),
    }
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/users");
  return { username: result.username, password: result.password, name: result.name };
}
