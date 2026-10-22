"use client";

import { useActionState, useState } from "react";
import {
  saveDraft, saveAndPublish, publishDraft, discardDraft, restoreVersion, uploadPortalAsset, removePortalAsset,
  type PortalState,
} from "@/app/portal-actions";
import type { PortalSettings } from "@/lib/portal-settings";
import {
  TEMPLATES, TEMPLATE_LABEL, RADII, RADIUS_LABEL, FONTS, FONT_LABEL, LOCALES, METHODS, METHOD_LABEL,
  FIELD_MODES, FIELD_MODE_LABEL, contrastRatio, MIN_CONTRAST,
} from "@/lib/portal-theme";

function Msg({ s }: { s: PortalState }) {
  if (!s) return null;
  return (
    <>
      {s.error && <p className="err">{s.error}</p>}
      {s.ok && <p className="okmsg">{s.ok}</p>}
      {s.warnings?.map((w) => <p key={w} className="err">Aviso: {w}</p>)}
    </>
  );
}

export function PreviewFrame({ version }: { version: string }) {
  const [width, setWidth] = useState<"mobile" | "desktop">("mobile");
  const [lang, setLang] = useState<"es" | "en">("es");
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ marginRight: "auto" }}>Vista previa</h2>
        <button type="button" className={width === "mobile" ? "" : "ghost"} onClick={() => setWidth("mobile")}>Móvil</button>
        <button type="button" className={width === "desktop" ? "" : "ghost"} onClick={() => setWidth("desktop")}>Escritorio</button>
        <button type="button" className={lang === "es" ? "" : "ghost"} onClick={() => setLang("es")}>ES</button>
        <button type="button" className={lang === "en" ? "" : "ghost"} onClick={() => setLang("en")}>EN</button>
      </div>
      <iframe
        key={`${version}-${lang}`}
        title="Vista previa del portal"
        src={`/preview/portal?lang=${lang}`}
        style={{
          width: width === "mobile" ? 390 : "100%", maxWidth: "100%", height: 640,
          border: "1px solid var(--line)", borderRadius: 12, display: "block", margin: "0 auto", background: "#fff",
        }}
      />
      <p className="muted">Se actualiza al guardar el borrador.</p>
    </div>
  );
}

export function EditorForm({ s }: { s: PortalSettings }) {
  const [state, action, pending] = useActionState(saveDraft, null);
  const [pubState, pubAction, pubPending] = useActionState(saveAndPublish, null);
  const [colors, setColors] = useState(s.colors);
  const ratio = contrastRatio(colors.text, colors.background);
  const setC = (k: keyof typeof colors) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setColors((c) => ({ ...c, [k]: e.target.value }));
  const sel = (name: string, def: string, opts: readonly string[], labels?: Record<string, string>) => (
    <select name={name} defaultValue={def}>{opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>
  );
  const colorField = (label: string, name: string, key: keyof typeof colors) => (
    <div><label>{label}</label>
      <div className="row"><input type="color" name={name} value={colors[key]} onChange={setC(key)} style={{ width: 56, padding: 2 }} />
        <code>{colors[key]}</code></div></div>
  );
  const textsBlock = (l: "es" | "en") => (
    <div>
      <h2>{l === "es" ? "Textos en español" : "Texts in English"}</h2>
      <label>Título</label><input name={`${l}_title`} defaultValue={s.texts[l].title} maxLength={80} />
      <label>Subtítulo</label><input name={`${l}_subtitle`} defaultValue={s.texts[l].subtitle} maxLength={200} />
      <label>Texto del botón</label><input name={`${l}_button`} defaultValue={s.texts[l].button} maxLength={30} required />
      <label>Pie</label><input name={`${l}_footer`} defaultValue={s.texts[l].footer} maxLength={200} />
      <label>Términos y condiciones</label>
      <textarea name={`terms_${l}`} defaultValue={s.terms[l]} rows={6} maxLength={8000}
        style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg)", color: "var(--ink)", font: "inherit" }} />
    </div>
  );

  return (
    <form action={action} className="card">
      <h2>Diseño y contenido</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div><label>Nombre visible</label><input name="display_name" defaultValue={s.display_name} maxLength={60} required /></div>
        <div><label>Plantilla</label>{sel("template", s.template, TEMPLATES, TEMPLATE_LABEL)}</div>
        <div><label>Idioma por defecto</label>{sel("default_locale", s.default_locale, LOCALES, { es: "Español", en: "English" })}</div>
        <div><label>Bordes</label>{sel("radius", s.radius, RADII, RADIUS_LABEL)}</div>
        <div><label>Tipografía</label>{sel("font", s.font, FONTS, FONT_LABEL)}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 8 }}>
        {colorField("Color principal (botón)", "color_primary", "primary")}
        {colorField("Color de acento", "color_accent", "accent")}
        {colorField("Color del texto", "color_text", "text")}
        {colorField("Fondo de la tarjeta", "color_background", "background")}
      </div>
      <p className={ratio >= MIN_CONTRAST ? "okmsg" : "err"}>
        Contraste texto/fondo: {ratio.toFixed(1)}:1 {ratio >= MIN_CONTRAST ? "(correcto)" : `(mínimo ${MIN_CONTRAST}:1 para publicar)`}
      </p>

      <h2 style={{ marginTop: 16 }}>Acceso</h2>
      <div className="row">
        {METHODS.map((m) => (
          <label key={m} className="inline" style={{ margin: 0 }}>
            <input type="checkbox" name={`method_${m}`} defaultChecked={s.methods.includes(m)} style={{ width: "auto" }} /> {METHOD_LABEL[m]}
          </label>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <div><label>Nombre</label>{sel("field_name", s.fields.name, FIELD_MODES, FIELD_MODE_LABEL)}</div>
        <div><label>Correo</label>{sel("field_email", s.fields.email, FIELD_MODES, FIELD_MODE_LABEL)}</div>
        <div><label>Teléfono</label>{sel("field_phone", s.fields.phone, FIELD_MODES, FIELD_MODE_LABEL)}</div>
      </div>
      <p className="muted">Pide solo los datos que realmente necesitas: cada dato extra debe justificarse legalmente.</p>
      <label>Duración de la sesión del invitado (minutos, 10 a 1440)</label>
      <input name="session_minutes" type="number" min={10} max={1440} defaultValue={s.session_minutes} required />
      <label>Después de conectar, ir a (https://…, opcional)</label>
      <input name="redirect_url" defaultValue={s.redirect_url} placeholder="https://tusitio.com/bienvenida" />
      <label>Enlace a tu política de privacidad (https://…, opcional)</label>
      <input name="privacy_url" defaultValue={s.privacy_url} placeholder="https://tusitio.com/privacidad" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginTop: 16 }}>
        {textsBlock("es")}{textsBlock("en")}
      </div>
      <p className="muted">Si cambias los términos y publicas, la versión de términos sube y los visitantes deberán aceptarlos de nuevo.</p>

      <div className="row">
        <button disabled={pending || pubPending}>{pending ? "Guardando…" : "Guardar borrador"}</button>
        <button type="submit" formAction={pubAction} disabled={pending || pubPending}>
          {pubPending ? "Publicando…" : "Guardar y publicar"}
        </button>
      </div>
      <p className="muted">«Guardar y publicar» guarda lo que ves en el formulario y lo publica de una vez.</p>
      <Msg s={state} />
      <Msg s={pubState} />
    </form>
  );
}

function AssetForm({ kind, label, current, hint }: { kind: "logo" | "background"; label: string; current: string | null; hint: string }) {
  const [up, upAction, upPending] = useActionState(uploadPortalAsset, null);
  const [rm, rmAction] = useActionState(removePortalAsset, null);
  return (
    <div>
      <label>{label}</label>
      {current && <p className="muted">Actual: <code>{current}</code></p>}
      <form action={upAction} className="row">
        <input type="hidden" name="kind" value={kind} />
        <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required style={{ width: "auto" }} />
        <button disabled={upPending}>{upPending ? "Subiendo…" : "Subir"}</button>
      </form>
      {current && (
        <form action={rmAction}><input type="hidden" name="kind" value={kind} /><button className="ghost">Quitar</button></form>
      )}
      <p className="muted">{hint}</p>
      <Msg s={up} /><Msg s={rm} />
    </div>
  );
}

export function Assets({ s }: { s: PortalSettings }) {
  return (
    <div className="card">
      <h2>Imágenes</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        <AssetForm kind="logo" label="Logo" current={s.assets.logo} hint="PNG, JPG o WebP de hasta 512 KB." />
        <AssetForm kind="background" label="Imagen de fondo" current={s.assets.background} hint="PNG, JPG o WebP de hasta 1 MB. Se usa en las plantillas con imagen." />
      </div>
    </div>
  );
}

export function PublishPanel({ hasDraft, published }: { hasDraft: boolean; published: number | null }) {
  const [pub, pubAction, pubPending] = useActionState(publishDraft, null);
  const [dis, disAction] = useActionState(discardDraft, null);
  return (
    <div className="card">
      <h2>Publicación</h2>
      <p className="muted">Este botón publica lo que ya está <b>guardado</b>; si acabas de escribir cambios en el formulario, usa «Guardar y publicar» más abajo. </p>
      <p className="muted">
        {published ? `Versión publicada: ${published}.` : "Todavía no hay versión publicada: los visitantes ven valores por defecto."}{" "}
        {hasDraft ? "Hay un borrador guardado." : "No hay borrador."}
      </p>
      <div className="row">
        <form action={pubAction}><button disabled={!hasDraft || pubPending}>{pubPending ? "Publicando…" : "Publicar el borrador guardado"}</button></form>
        <form action={disAction}><button className="ghost" disabled={!hasDraft}>Descartar borrador</button></form>
      </div>
      <Msg s={pub} /><Msg s={dis} />
    </div>
  );
}

export function RestoreButton({ version }: { version: number }) {
  const [st, action] = useActionState(restoreVersion, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="version" value={version} />
      <button className="ghost">Copiar al borrador</button>
      {st?.error && <span className="err">{st.error}</span>}
      {st?.ok && <span className="okmsg">{st.ok}</span>}
    </form>
  );
}
