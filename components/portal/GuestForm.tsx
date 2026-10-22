"use client";

import { useActionState, useEffect } from "react";
import { guestConnect } from "@/app/guest-actions";
import type { PortalSettings } from "@/lib/portal-settings";

export type GuestLabels = {
  name: string; email: string; phone: string; voucher: string; accept: string; terms: string; marketing: string;
  version: string; noTerms: string; connecting: string; previewDone: string;
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

  // Al terminar, el navegador va al login del Hotspot (navegación normal, no formulario)
  useEffect(() => {
    if (state?.redirect) window.location.assign(state.redirect);
  }, [state?.redirect]);

  const done = !!state?.redirect;
  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="hs_mac" value={hs.mac} />
      <input type="hidden" name="hs_ip" value={hs.ip} />
      <input type="hidden" name="hs_login" value={hs.login} />
      <input type="hidden" name="hs_orig" value={hs.orig} />

      {fields.name !== "off" && (
        <><label>{t.name}</label><input type="text" name="name" required={fields.name === "required"} autoComplete="name" maxLength={100} /></>
      )}
      {methods.includes("email") && fields.email !== "off" && (
        <><label>{t.email}</label><input type="email" name="email" required={fields.email === "required"} autoComplete="email" maxLength={254} /></>
      )}
      {methods.includes("phone") && fields.phone !== "off" && (
        <><label>{t.phone}</label><input type="tel" name="phone" required={fields.phone === "required"} autoComplete="tel" maxLength={30} /></>
      )}
      {methods.includes("voucher") && (
        <><label>{t.voucher}</label><input type="text" name="voucher" autoComplete="off" maxLength={40} /></>
      )}
      <label className="pv-check"><input type="checkbox" name="accept_terms" required /> <span>{t.accept} ({t.version} {termsVersion})</span></label>
      <label className="pv-check"><input type="checkbox" name="accept_marketing" /> <span>{t.marketing}</span></label>
      <details>
        <summary>{t.terms}</summary>
        <pre>{terms || t.noTerms}</pre>
      </details>

      {state?.error && <p className="pv-err" role="alert">{state.error}</p>}
      {state?.simulated && <p className="pv-ok">{t.previewDone}</p>}
      {done && <p className="pv-ok">{t.connecting}</p>}
      <button className="pv-btn" type="submit" disabled={pending || done}>{pending || done ? "…" : button}</button>
    </form>
  );
}
