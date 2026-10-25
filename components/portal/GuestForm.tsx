"use client";

import { useActionState, useEffect, useState } from "react";
import { guestConnect } from "@/app/guest-actions";
import type { PortalSettings } from "@/lib/portal-settings";

export type GuestLabels = {
  name: string; email: string; phone: string; voucher: string; accept: string; terms: string; marketing: string;
  version: string; noTerms: string; connecting: string; previewDone: string;
  code: string; codeSent: string; resend: string; changeEmail: string; verify: string;
};

type Props = {
  slug: string;
  locale: "es" | "en";
  fields: PortalSettings["fields"];
  methods: PortalSettings["methods"];
  button: string;
  termsVersion: number;
  terms: string;
  hs: { mac: string; ip: string; login: string; orig: string };
  t: GuestLabels;
};

export default function GuestForm({ slug, locale, fields, methods, button, termsVersion, terms, hs, t }: Props) {
  const [state, action, pending] = useActionState(guestConnect, null);
  // Campos controlados: React 19 vacía los formularios tras cada acción, y el visitante no debe volver a escribir sus datos
  // al pasar a la pantalla del código ni si hay un error.
  const [v, setV] = useState({ name: "", email: "", phone: "", voucher: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((o) => ({ ...o, [k]: e.target.value }));

  // Al terminar, el navegador va al login del Hotspot o a la campaña (navegación normal, no formulario)
  useEffect(() => {
    if (state?.redirect) window.location.assign(state.redirect);
  }, [state?.redirect]);
  // El servidor pidió el código que acaba de enviar por correo
  useEffect(() => {
    if (state?.needCode) { setStep(2); setCode(""); }
  }, [state]);

  const done = !!state?.redirect;
  const step2 = step === 2 && !!state?.needCode;
  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="hs_mac" value={hs.mac} />
      <input type="hidden" name="hs_ip" value={hs.ip} />
      <input type="hidden" name="hs_login" value={hs.login} />
      <input type="hidden" name="hs_orig" value={hs.orig} />

      {step2 ? (
        <>
          {/* Los datos del primer paso viajan ocultos junto con el código */}
          <input type="hidden" name="name" value={v.name} />
          <input type="hidden" name="email" value={v.email} />
          <input type="hidden" name="phone" value={v.phone} />
          <input type="hidden" name="voucher" value={v.voucher} />
          {acceptTerms && <input type="hidden" name="accept_terms" value="on" />}
          {acceptMarketing && <input type="hidden" name="accept_marketing" value="on" />}
          <p className="pv-ok">{t.codeSent.replace("{email}", state?.needCode ?? "")}</p>
          <label>{t.code}</label>
          <input type="text" name="code" value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric"
            autoComplete="one-time-code" maxLength={12} pattern="[0-9 \-]*" autoFocus />
          {state?.error && <p className="pv-err" role="alert">{state.error}</p>}
          {done && <p className="pv-ok">{t.connecting}</p>}
          <button className="pv-btn" type="submit" disabled={pending || done}>{pending || done ? "…" : t.verify}</button>
          <p className="pv-sub" style={{ marginTop: 12 }}>
            <button className="pv-link" type="submit" name="resend" value="1" formNoValidate disabled={pending || done}>{t.resend}</button>{" · "}
            <button className="pv-link" type="button" onClick={() => setStep(1)} disabled={pending || done}>{t.changeEmail}</button>
          </p>
        </>
      ) : (
        <>
          {fields.name !== "off" && (
            <><label>{t.name}</label><input type="text" name="name" value={v.name} onChange={set("name")} required={fields.name === "required"} autoComplete="name" maxLength={100} /></>
          )}
          {methods.includes("email") && fields.email !== "off" && (
            <><label>{t.email}</label><input type="email" name="email" value={v.email} onChange={set("email")} required={fields.email === "required"} autoComplete="email" maxLength={254} /></>
          )}
          {methods.includes("phone") && fields.phone !== "off" && (
            <><label>{t.phone}</label><input type="tel" name="phone" value={v.phone} onChange={set("phone")} required={fields.phone === "required"} autoComplete="tel" maxLength={30} /></>
          )}
          {methods.includes("voucher") && (
            <><label>{t.voucher}</label><input type="text" name="voucher" value={v.voucher} onChange={set("voucher")} autoComplete="off" maxLength={40} /></>
          )}
          <label className="pv-check"><input type="checkbox" name="accept_terms" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} required /> <span>{t.accept} ({t.version} {termsVersion})</span></label>
          <label className="pv-check"><input type="checkbox" name="accept_marketing" checked={acceptMarketing} onChange={(e) => setAcceptMarketing(e.target.checked)} /> <span>{t.marketing}</span></label>
          <details>
            <summary>{t.terms}</summary>
            <pre>{terms || t.noTerms}</pre>
          </details>

          {state?.error && <p className="pv-err" role="alert">{state.error}</p>}
          {state?.simulated && <p className="pv-ok">{t.previewDone}</p>}
          {done && <p className="pv-ok">{t.connecting}</p>}
          <button className="pv-btn" type="submit" disabled={pending || done}>{pending || done ? "…" : button}</button>
        </>
      )}
    </form>
  );
}
