"use client";

import { useActionState } from "react";
import { savePromotion, type PromoState } from "@/app/promotions-actions";
import { SEGMENTS, SEGMENT_LABEL, type Segment } from "@/lib/promotions";

export type PromoFormValues = {
  id?: string; name: string; segment: Segment; inactive_days: number;
  title: string; body: string; cta_label: string; cta_url: string; image: string | null;
  starts_at: string; ends_at: string; // «YYYY-MM-DDTHH:mm» en hora de Panamá
};

export const EMPTY: PromoFormValues = {
  name: "", segment: "all", inactive_days: 30, title: "", body: "", cta_label: "", cta_url: "", image: null, starts_at: "", ends_at: "",
};

export function PromotionForm({ v }: { v: PromoFormValues }) {
  const [state, action, pending] = useActionState<PromoState, FormData>(savePromotion, null);
  return (
    <form action={action} className="card">
      <h2>{v.id ? `Editar «${v.name}»` : "Nueva campaña"}</h2>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {v.image && <input type="hidden" name="image" value={v.image} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <div><label>Nombre interno</label><input name="name" required maxLength={80} defaultValue={v.name} autoComplete="off" placeholder="Ej. Happy hour de viernes" /></div>
        <div>
          <label>¿Quién la ve?</label>
          <select name="segment" defaultValue={v.segment}>
            {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}
          </select>
        </div>
        <div><label>Días de ausencia (solo «vuelven tras una ausencia»)</label><input name="inactive_days" type="number" min={7} max={365} defaultValue={v.inactive_days} /></div>
      </div>

      <h3 style={{ marginTop: 16 }}>Lo que ve el visitante</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <div><label>Título</label><input name="title" required maxLength={80} defaultValue={v.title} autoComplete="off" /></div>
        <div><label>Texto del botón (si hay enlace)</label><input name="cta_label" maxLength={30} defaultValue={v.cta_label} autoComplete="off" placeholder="Ej. Ver menú" /></div>
        <div style={{ gridColumn: "1 / -1" }}><label>Mensaje</label><textarea name="body" rows={3} maxLength={300} defaultValue={v.body} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label>Enlace del botón (opcional, solo https://)</label><input name="cta_url" maxLength={300} defaultValue={v.cta_url} autoComplete="off" placeholder="https://" /></div>
        <div>
          <label>Imagen (PNG, JPG o WebP, hasta 1 MB)</label>
          <input name="file" type="file" accept="image/png,image/jpeg,image/webp" />
          {v.image && <label className="muted" style={{ display: "block", marginTop: 6 }}><input type="checkbox" name="remove_image" style={{ width: "auto" }} /> Quitar la imagen actual</label>}
        </div>
      </div>

      <h3 style={{ marginTop: 16 }}>Cuándo (hora de Panamá, opcional)</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <div><label>Desde</label><input name="starts_at" type="datetime-local" defaultValue={v.starts_at} /></div>
        <div><label>Hasta</label><input name="ends_at" type="datetime-local" defaultValue={v.ends_at} /></div>
      </div>
      <p>
        <button disabled={pending}>{pending ? "Guardando…" : v.id ? "Guardar cambios" : "Crear campaña"}</button>
        {v.id && <> <a href="/admin/promotions">Volver</a></>}
      </p>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
    </form>
  );
}
