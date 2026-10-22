"use client";

import { useActionState, useState } from "react";
import { saveSchedule, type PortalState } from "@/app/portal-actions";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
type Row = { on: boolean; start: string; end: string };

export function ScheduleForm({ initial }: { initial: Row[] }) {
  const [state, action, pending] = useActionState<PortalState, FormData>(saveSchedule, null);
  const [rows, setRows] = useState<Row[]>(initial);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const none = rows.every((r) => !r.on);
  return (
    <form action={action} className="card">
      <h2>Horario de acceso de alumnos</h2>
      <p className="muted">
        Fuera de estas horas el portal no da acceso a los visitantes. Al conectarse dentro del horario, el acceso dura
        hasta que cierre la ventana. Hora de Panamá.
      </p>
      {none && <p className="err">Sin horario configurado, los alumnos pueden conectarse en cualquier momento.</p>}
      <table className="table">
        <tbody>
          {DAYS.map((day, i) => (
            <tr key={day}>
              <td>
                <label className="inline" style={{ margin: 0 }}>
                  <input type="checkbox" name={`on_${i + 1}`} checked={rows[i].on} style={{ width: "auto" }}
                    onChange={(e) => set(i, { on: e.target.checked })} /> {day}
                </label>
              </td>
              <td>
                <input type="time" name={`start_${i + 1}`} value={rows[i].start} disabled={!rows[i].on}
                  onChange={(e) => set(i, { start: e.target.value })} style={{ width: "auto" }} />
                {" a "}
                <input type="time" name={`end_${i + 1}`} value={rows[i].end} disabled={!rows[i].on}
                  onChange={(e) => set(i, { end: e.target.value })} style={{ width: "auto" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p><button disabled={pending}>{pending ? "Guardando…" : "Guardar horario"}</button></p>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
    </form>
  );
}
