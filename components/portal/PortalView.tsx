import type { CSSProperties } from "react";
import type { PortalSettings } from "@/lib/portal-settings";
import { FONT_STACK, RADIUS_PX, readableOn } from "@/lib/portal-theme";

type Props = {
  settings: PortalSettings;
  locale: "es" | "en";
  termsVersion: number;
  assetBase: string; // ej. /w/mi-local/assets
  langBase: string; // ej. /w/mi-local
  banner?: string;
};

const T = {
  es: {
    name: "Nombre", email: "Correo electrónico", phone: "Teléfono", voucher: "Código de acceso",
    accept: "He leído y acepto los términos y condiciones", terms: "Términos y condiciones",
    marketing: "Quiero recibir promociones y novedades (opcional)", privacy: "Política de privacidad",
    version: "versión", simulated: "Vista simulada: el acceso real se activa al conectarse al Hotspot.",
    noTerms: "Términos pendientes de configurar.",
  },
  en: {
    name: "Name", email: "Email", phone: "Phone", voucher: "Access code",
    accept: "I have read and accept the terms and conditions", terms: "Terms and conditions",
    marketing: "I want to receive offers and news (optional)", privacy: "Privacy policy",
    version: "version", simulated: "Simulated view: real access is enabled when connecting through the Hotspot.",
    noTerms: "Terms not configured yet.",
  },
} as const;

// CSS fijo (sin datos del cliente); los valores personalizados llegan como variables validadas
const CSS = `
.pv{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:48px 16px 16px;background:var(--bg-page);font-family:var(--font);color:var(--text);position:relative}
.pv *{box-sizing:border-box}
.pv-card-box{width:100%;max-width:420px;background:var(--bg);color:var(--text);border-radius:var(--radius);padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.15)}
.pv-logo{display:block;max-width:180px;max-height:80px;margin:0 auto 16px;object-fit:contain}
.pv h1{font-size:22px;margin:0 0 6px;text-align:center}
.pv-sub{margin:0 0 16px;text-align:center;opacity:.8}
.pv label{display:block;font-size:13px;margin:12px 0 4px;color:inherit}
.pv input[type=text],.pv input[type=email],.pv input[type=tel]{width:100%;padding:10px;border:1px solid rgba(127,127,127,.5);border-radius:calc(var(--radius)/2);font:inherit;background:#fff;color:#111}
.pv label.pv-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:12px 0 0}
.pv .pv-check input[type=checkbox]{width:auto;padding:0;margin:3px 0 0;flex:none}
.pv-btn{width:100%;margin-top:18px;padding:12px;border:0;border-radius:calc(var(--radius)/2);background:var(--primary);color:var(--on-primary);font:inherit;font-weight:600;cursor:pointer}
.pv details{margin-top:12px;font-size:13px}
.pv pre{white-space:pre-wrap;font:inherit;max-height:160px;overflow:auto;margin:6px 0 0;padding:8px;border-left:3px solid var(--accent)}
.pv-foot{margin-top:16px;text-align:center;font-size:12px;opacity:.75}
.pv-foot a{color:var(--text);text-decoration:underline}
.pv-lang{position:absolute;top:10px;right:14px;font-size:13px}
.pv-lang a{color:inherit;margin-left:8px;text-decoration:underline}
.pv-banner{position:fixed;left:0;right:0;top:0;padding:6px 12px;background:#111827;color:#fff;font-size:12px;text-align:center;z-index:5}
.pv-split{display:grid;grid-template-columns:1fr;padding:30px 0 0;align-items:stretch}
.pv-split .pv-side{min-height:160px;background-color:var(--primary);background-size:cover;background-position:center}
.pv-split .pv-main{display:flex;align-items:center;justify-content:center;padding:24px 16px}
.pv-split .pv-card-box{box-shadow:none}
@media(min-width:800px){.pv-split{grid-template-columns:1fr 1fr}.pv-split .pv-side{min-height:calc(100vh - 30px)}}
`;

export default function PortalView({ settings: s, locale, termsVersion, assetBase, langBase, banner }: Props) {
  const t = T[locale];
  const tx = s.texts[locale];
  const terms = s.terms[locale].trim() || s.terms[s.default_locale].trim();
  const bg = s.assets.background ? `url(${assetBase}/${s.assets.background})` : undefined;
  const style = {
    "--primary": s.colors.primary,
    "--accent": s.colors.accent,
    "--text": s.colors.text,
    "--bg": s.colors.background,
    "--on-primary": readableOn(s.colors.primary),
    "--radius": `${RADIUS_PX[s.radius]}px`,
    "--font": FONT_STACK[s.font],
    "--bg-page": s.template === "card" || !bg ? "#eef0f4" : "transparent",
    ...(s.template === "full" && bg ? { backgroundImage: bg, backgroundSize: "cover", backgroundPosition: "center" } : {}),
  } as CSSProperties;

  const box = (
    <div className="pv-card-box">
      {s.assets.logo && <img className="pv-logo" src={`${assetBase}/${s.assets.logo}`} alt={s.display_name} />}
      <h1>{tx.title || s.display_name}</h1>
      {tx.subtitle && <p className="pv-sub">{tx.subtitle}</p>}
      <form>
        {s.fields.name !== "off" && (
          <><label>{t.name}</label><input type="text" name="name" required={s.fields.name === "required"} autoComplete="name" /></>
        )}
        {s.methods.includes("email") && s.fields.email !== "off" && (
          <><label>{t.email}</label><input type="email" name="email" required={s.fields.email === "required"} autoComplete="email" /></>
        )}
        {s.methods.includes("phone") && s.fields.phone !== "off" && (
          <><label>{t.phone}</label><input type="tel" name="phone" required={s.fields.phone === "required"} autoComplete="tel" /></>
        )}
        {s.methods.includes("voucher") && (
          <><label>{t.voucher}</label><input type="text" name="voucher" autoComplete="off" /></>
        )}
        <label className="pv-check"><input type="checkbox" name="accept_terms" required /> <span>{t.accept} ({t.version} {termsVersion})</span></label>
        <label className="pv-check"><input type="checkbox" name="accept_marketing" /> <span>{t.marketing}</span></label>
        <details>
          <summary>{t.terms}</summary>
          <pre>{terms || t.noTerms}</pre>
        </details>
        <button className="pv-btn" type="button">{tx.button}</button>
      </form>
      <div className="pv-foot">
        {tx.footer && <p>{tx.footer}</p>}
        {s.privacy_url && <a href={s.privacy_url} rel="noopener noreferrer" target="_blank">{t.privacy}</a>}
      </div>
    </div>
  );

  return (
    <div className={`pv ${s.template === "split" ? "pv-split" : ""}`} style={style}>
      <style>{CSS}</style>
      {banner ? <div className="pv-banner">{banner}</div> : <div className="pv-banner">{t.simulated}</div>}
      <div className="pv-lang">
        <a href={`${langBase}?lang=es`}>ES</a><a href={`${langBase}?lang=en`}>EN</a>
      </div>
      {s.template === "split" ? (
        <>
          <div className="pv-side" style={bg ? { backgroundImage: bg } : undefined} />
          <div className="pv-main">{box}</div>
        </>
      ) : (
        box
      )}
    </div>
  );
}
