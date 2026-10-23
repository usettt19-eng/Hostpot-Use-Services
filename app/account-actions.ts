"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { validateNewPassword } from "@/lib/password";
import { allow } from "@/lib/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/guest-utils";
import { siteOrigin } from "@/lib/site-url";

export type AccountState = { error?: string; ok?: string } | null;

const RESET_COOKIE = "pw_reset";
const field = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Cambiar la contraseña con la sesión abierta: pide la actual. Si la cuenta tenía contraseña temporal, la marca como resuelta. */
export async function changePassword(_: AccountState, fd: FormData): Promise<AccountState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) redirect("/login");

  if (!allow(`pw:${auth.user.id}`, 5, 15 * 60_000)) return { error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo" };
  const current = field(fd, "current");
  const next = field(fd, "next");
  const problem = validateNewPassword(current, next, field(fd, "confirm"));
  if (problem) return { error: problem };

  // Comprueba la contraseña actual iniciando sesión de nuevo con ella
  const check = await supabase.auth.signInWithPassword({ email: auth.user.email, password: current });
  if (check.error) return { error: "La contraseña actual no es correcta" };

  const { error } = await supabase.auth.updateUser({ password: next, data: { must_change_password: false } });
  if (error) {
    console.error("changePassword:", error.code ?? "error");
    return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo" };
  }
  await supabase.auth.signOut({ scope: "others" }); // cierra las demás sesiones abiertas de esta cuenta
  if (auth.user.user_metadata?.must_change_password) redirect("/dashboard");
  return { ok: "Contraseña cambiada. Las demás sesiones de tu cuenta se cerraron." };
}

/** «Olvidé mi contraseña»: manda un enlace al correo. La respuesta es la misma exista o no la cuenta. */
export async function requestPasswordReset(_: AccountState, fd: FormData): Promise<AccountState> {
  const email = normalizeEmail(field(fd, "email"));
  const generic: AccountState = { ok: "Si ese correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Revisa también la carpeta de correo no deseado." };
  if (!isValidEmail(email)) return { error: "Escribe un correo válido" };

  const h = await headers();
  const ip = h.get("x-real-ip") ?? "desconocida";
  if (!allow(`reset-ip:${ip}`, 5, 15 * 60_000) || !allow(`reset-mail:${email}`, 3, 60 * 60_000)) {
    return { error: "Demasiados intentos. Espera un rato y vuelve a intentarlo" };
  }

  const site = siteOrigin(h);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback` });
  if (error) console.error("requestPasswordReset:", error.code ?? "error"); // no se le dice a quien pregunta
  return generic;
}

/** Elegir la contraseña nueva después de abrir el enlace del correo (sin pedir la actual). Solo con la marca que pone /auth/callback. */
export async function setNewPassword(_: AccountState, fd: FormData): Promise<AccountState> {
  const jar = await cookies();
  if (jar.get(RESET_COOKIE)?.value !== "1") redirect("/forgot-password");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/forgot-password");

  const next = field(fd, "next");
  const problem = validateNewPassword(null, next, field(fd, "confirm"));
  if (problem) return { error: problem };

  const { error } = await supabase.auth.updateUser({ password: next, data: { must_change_password: false } });
  if (error) {
    console.error("setNewPassword:", error.code ?? "error");
    return { error: "No se pudo guardar la contraseña. Pide un enlace nuevo e inténtalo de nuevo" };
  }
  jar.delete(RESET_COOKIE);
  await supabase.auth.signOut({ scope: "others" });
  redirect("/dashboard");
}
