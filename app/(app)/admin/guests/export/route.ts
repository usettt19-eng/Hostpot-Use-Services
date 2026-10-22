import { createClient } from "@/lib/supabase";
import { decryptSecret } from "@/lib/crypto";
import { requireAdminTenant } from "@/lib/portal";
import { csvCell } from "@/lib/guest-utils";

export async function GET() {
  await requireAdminTenant();
  const supabase = await createClient(); // con RLS: solo ve lo de su establecimiento
  const { data: guests } = await supabase
    .from("guests").select("id, email_enc, full_name, visit_count, first_seen_at, last_seen_at")
    .order("last_seen_at", { ascending: false }).limit(10000);
  const ids = (guests ?? []).map((g) => g.id);
  const marketing = new Map<string, boolean>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("guest_consents").select("guest_id, granted, created_at")
      .eq("kind", "marketing").in("guest_id", ids.slice(i, i + 200)).order("created_at", { ascending: false });
    for (const c of data ?? []) if (!marketing.has(c.guest_id)) marketing.set(c.guest_id, c.granted);
  }
  const safe = (enc: string) => { try { return decryptSecret(enc); } catch { return ""; } };
  const lines = [["correo", "nombre", "visitas", "primera_visita", "ultima_visita", "acepta_promociones"].map(csvCell).join(",")];
  for (const g of guests ?? []) {
    lines.push([safe(g.email_enc), g.full_name, g.visit_count, g.first_seen_at, g.last_seen_at, marketing.get(g.id) ? "si" : "no"].map(csvCell).join(","));
  }
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="visitantes.csv"',
      "Cache-Control": "no-store",
    },
  });
}
