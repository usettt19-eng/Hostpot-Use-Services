"use client";

import { useActionState } from "react";
import { changePassword, requestPasswordReset, setNewPassword, type AccountState } from "@/app/account-actions";

const Msg = ({ s }: { s: AccountState }) => (
  <>
    {s?.error && <p className="err" role="alert">{s.error}</p>}
    {s?.ok && <p className="okmsg" role="status">{s.ok}</p>}
  </>
);

export function ChangePasswordForm({ forced }: { forced?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action}>
      <label htmlFor="pw-current">Contraseña actual{forced ? " (la temporal que te dieron)" : ""}</label>
      <input id="pw-current" name="current" type="password" required autoComplete="current-password" />
      <label htmlFor="pw-next">Contraseña nueva (mínimo 10 caracteres, con letras y números)</label>
      <input id="pw-next" name="next" type="password" required minLength={10} maxLength={72} autoComplete="new-password" />
      <label htmlFor="pw-confirm">Repite la contraseña nueva</label>
      <input id="pw-confirm" name="confirm" type="password" required minLength={10} maxLength={72} autoComplete="new-password" />
      <Msg s={state} />
      <p><button disabled={pending}>{pending ? "Guardando…" : "Cambiar contraseña"}</button></p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <form action={action}>
      <label htmlFor="fg-email">Correo de tu cuenta</label>
      <input id="fg-email" name="email" type="email" required autoComplete="email" />
      <Msg s={state} />
      <p><button disabled={pending || !!state?.ok}>{pending ? "Enviando…" : "Enviarme el enlace"}</button></p>
    </form>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, null);
  return (
    <form action={action}>
      <label htmlFor="rs-next">Contraseña nueva (mínimo 10 caracteres, con letras y números)</label>
      <input id="rs-next" name="next" type="password" required minLength={10} maxLength={72} autoComplete="new-password" />
      <label htmlFor="rs-confirm">Repite la contraseña nueva</label>
      <input id="rs-confirm" name="confirm" type="password" required minLength={10} maxLength={72} autoComplete="new-password" />
      <Msg s={state} />
      <p><button disabled={pending}>{pending ? "Guardando…" : "Guardar contraseña"}</button></p>
    </form>
  );
}
