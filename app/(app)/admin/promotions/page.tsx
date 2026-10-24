import Link from "next/link";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminTenant } from "@/lib/portal";
import { requireModule } from "@/lib/tenant-modules";
import { SEGMENT_LABEL, STATUS_LABEL, ctrText, isoToPanamaLocal, parseContent, type Segment } from "@/lib/promotions";
import { deletePromotion, setPromotionStatus } from "@/app/promotions-actions";
import PromoCard from "@/components/portal/PromoCard";
import { EMPTY, PromotionForm, type PromoFormValues } from "./form";

export const dynamic = "force-dynamic";
const EVENT_LIMIT = 100_000;

type Row = {
  id: string; name: string; status: "draft" | "active" | "paused"; segment: Segment; inactive_days: number;
  content: unknown; starts_at: string | null; ends_at: string | null; created_at: string;
};

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("es-PA", { timeZone: "America/Panama", dateStyle: "short", timeStyle: "short" }) : "—";

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const ctx = await requireAdminTenant();
  await requireModule(ctx.tenantId, "promotions");
  const { edit } = await searchParams;
  const db = createAdminClient();
  const [list, ev] = await Promise.all([
    db.from("promotions").select("id, name, status, segment, inactive_days, content, starts_at, ends_at, created_at")
      .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }),
    db.from("promotion_events").select("promotion_id, kind").eq("tenant_id", ctx.tenantId).limit(EVENT_LIMIT),
  ]);
  const rows = (list.data ?? []) as Row[];
  const stats = new Map<string, { imp: number; clk: number }>();
  for (const e of ev.data ?? []) {
    const s = stats.get(e.promotion_id) ?? { imp: 0, clk: 0 };
    if (e.kind === "impression") s.imp++; else s.clk++;
    stats.set(e.promotion_id, s);
  }
  const truncated = (ev.data?.length ?? 0) >= EVENT_LIMIT;

  const editing = edit ? rows.find((r) => r.id === edit) : undefined;
  const ec = editing ? parseContent(editing.content) : null;
  const values: PromoFormValues = editing && ec
    ? { id: editing.id, name: editing.name, segment: editing.segment, inactive_days: editing.inactive_days,
        title: ec.title, body: ec.body, cta_label: ec.cta_label, cta_url: ec.cta_url, image: ec.image,
        starts_at: isoToPanamaLocal(editing.starts_at), ends_at: isoToPanamaLocal(editing.ends_at) }
    : EMPTY;
  const base = editing ? `/w/${ctx.slug}/promo/${editing.id}` : "";

  return (
    <>
      <div className="card">
        <h1>Promociones</h1>
        <p className="muted">
          Una campaña es lo que el visitante ve justo después de conectarse: una imagen, un mensaje y, si quieres, un botón con un enlace.
          Si hay varias activas, cada visitante ve la más específica para él. No se guarda quién la vio: solo se cuentan impresiones y clics.
        </p>
        {truncated && <p className="err">Hay muchos eventos: las cifras pueden estar incompletas.</p>}
      </div>

      <PromotionForm key={editing?.id ?? "nueva"} v={values} />
      {editing && ec && (
        <div className="card">
          <h2>Vista previa</h2>
          <div style={{ background: "#eef0f4", padding: 16, borderRadius: 10 }}>
            <PromoCard content={ec} imageSrc={ec.image ? `${base}/image` : null} ctaHref={ec.cta_url ? "#" : null} nextHref="#" />
          </div>
        </div>
      )}

      <div className="card scroll">
        <h2>Campañas</h2>
        <table className="table">
          <thead><tr><th>Campaña</th><th>Quién la ve</th><th>Vigencia</th><th>Estado</th><th>Impresiones</th><th>Clics</th><th>Clics / impresiones</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="muted">Todavía no hay campañas.</td></tr>}
            {rows.map((r) => {
              const s = stats.get(r.id) ?? { imp: 0, clk: 0 };
              return (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td>{SEGMENT_LABEL[r.segment]}{r.segment === "inactive" ? ` (${r.inactive_days} días)` : ""}</td>
                  <td>{fmt(r.starts_at)} → {fmt(r.ends_at)}</td>
                  <td><span className={`badge ${r.status === "active" ? "active" : r.status === "paused" ? "pending" : ""}`}>{STATUS_LABEL[r.status]}</span></td>
                  <td>{s.imp}</td><td>{s.clk}</td><td>{ctrText(s.imp, s.clk)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/admin/promotions?edit=${r.id}`}>Editar</Link>{" "}
                    <form action={setPromotionStatus} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={r.status === "active" ? "paused" : "active"} />
                      <button className="ghost">{r.status === "active" ? "Pausar" : "Activar"}</button>
                    </form>{" "}
                    <form action={deletePromotion} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="danger">Borrar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
