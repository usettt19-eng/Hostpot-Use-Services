import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncAllGuestSessions } from "@/lib/guest-sync";
import { syncAllStaffSessions } from "@/lib/staff-history";

export const dynamic = "force-dynamic";

/**
 * Pone al día las sesiones de invitados y cierra las terminadas, y registra el historial de conexiones de los usuarios del portal. Lo llama cron del servidor cada minuto:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://connect.useservices.company/api/cron/guests-sync
 * Sin el secreto correcto responde 401 y no hace nada.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("No autorizado", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const result = await syncAllGuestSessions().catch((e) => {
    console.error("guests-sync:", e instanceof Error ? e.message : "error");
    return null;
  });
  if (!result) return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  // El historial del personal no debe tumbar la sincronización de invitados
  const staff = await syncAllStaffSessions().catch((e) => {
    console.error("staff-sync:", e instanceof Error ? e.message : "error");
    return null;
  });
  return Response.json({ ok: true, ...result, staff }, { headers: { "Cache-Control": "no-store" } });
}
