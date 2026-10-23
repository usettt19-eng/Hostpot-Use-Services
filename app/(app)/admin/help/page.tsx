import { requireAdminTenant } from "@/lib/portal";
import { FAQ } from "@/lib/faq";
import Faq from "@/components/Faq";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  await requireAdminTenant();
  return (
    <>
      <div className="card">
        <h1>Preguntas frecuentes</h1>
        <p className="muted" style={{ margin: 0 }}>Cómo manejar a tus usuarios, el portal, los visitantes y los equipos de tu red. Escribe una palabra para buscar.</p>
      </div>
      <Faq groups={FAQ} />
    </>
  );
}
