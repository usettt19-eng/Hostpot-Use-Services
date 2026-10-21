import { getPortalState, requireAdminTenant } from "@/lib/portal";
import { defaultSettings } from "@/lib/portal-settings";
import { Assets, EditorForm, PreviewFrame, PublishPanel, RestoreButton } from "./editor";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { published: "Publicada", archived: "Anterior" };

export default async function PortalPage() {
  const ctx = await requireAdminTenant();
  const { draft, published, history } = await getPortalState(ctx.tenantId, ctx.tenantName);
  const settings = (draft ?? published)?.settings ?? defaultSettings(ctx.tenantName);
  const stamp = draft?.id ?? published?.id ?? "base";
  const when = (d: string | null) => (d ? new Date(d).toLocaleString("es") : "—");

  return (
    <>
      <div className="card">
        <h1>Portal del establecimiento</h1>
        <p className="muted">
          Esto es lo que ven tus visitantes antes de conectarse. Dirección pública:{" "}
          <a href={`/w/${ctx.slug}`} target="_blank" rel="noopener noreferrer"><code>/w/{ctx.slug}</code></a>
        </p>
      </div>
      <PublishPanel hasDraft={!!draft} published={published?.version ?? null} />
      <EditorForm key={`${stamp}-${JSON.stringify(settings).length}`} s={settings} />
      <Assets s={settings} />
      <PreviewFrame version={`${stamp}-${JSON.stringify(settings).length}`} />
      <div className="card scroll">
        <h2>Historial</h2>
        <table className="table">
          <thead><tr><th>Versión</th><th>Estado</th><th>Publicada</th><th>Términos</th><th /></tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={5} className="muted">Aún no has publicado.</td></tr>}
            {history.map((h) => (
              <tr key={h.id}>
                <td>{h.version}</td><td>{STATUS[h.status]}</td><td>{when(h.published_at)}</td>
                <td>v{h.terms_version}</td><td><RestoreButton version={h.version} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
