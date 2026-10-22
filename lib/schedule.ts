// Ventanas de acceso por horario (escuelas). Hora local de Panamá; no tiene horario de verano.

export type Window = { weekday: number; start: number; end: number }; // weekday: 1 = lunes … 7 = domingo; start/end en minutos desde medianoche

export const TZ = "America/Panama";
const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Día de la semana (1–7) y minutos desde medianoche, en la hora local del establecimiento. */
export function localClock(now: Date, tz = TZ): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { weekday: wd, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Minutos que quedan de la ventana abierta ahora, o null si está cerrado. */
export function minutesOpenLeft(windows: Window[], now: Date, tz = TZ): number | null {
  const { weekday, minutes } = localClock(now, tz);
  const w = windows.find((x) => x.weekday === weekday && x.start <= minutes && minutes < x.end);
  return w ? w.end - minutes : null;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Texto para el visitante: cuándo vuelve a abrir. */
export function nextOpeningText(windows: Window[], now: Date, tz = TZ): string | null {
  if (!windows.length) return null;
  const { weekday, minutes } = localClock(now, tz);
  for (let d = 0; d <= 7; d++) {
    const day = ((weekday - 1 + d) % 7) + 1;
    const todays = windows
      .filter((x) => x.weekday === day && (d > 0 || x.start > minutes))
      .sort((a, b) => a.start - b.start);
    if (todays.length) {
      const w = todays[0];
      return `${d === 0 ? "hoy" : DAY_NAMES[day - 1]} a las ${hhmm(w.start)}`;
    }
  }
  return null;
}

/** Valida y ordena las ventanas que envía el admin. Devuelve el error o null. */
export function validateWindows(windows: Window[]): string | null {
  for (const w of windows) {
    if (!Number.isInteger(w.weekday) || w.weekday < 1 || w.weekday > 7) return "Día inválido";
    if (!Number.isInteger(w.start) || !Number.isInteger(w.end) || w.start < 0 || w.end > 1440 || w.start >= w.end) {
      return "Cada horario debe tener inicio antes del fin, dentro del mismo día";
    }
  }
  const byDay = new Map<number, Window[]>();
  for (const w of windows) byDay.set(w.weekday, [...(byDay.get(w.weekday) ?? []), w]);
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) if (list[i].start < list[i - 1].end) return "Los horarios de un mismo día no pueden cruzarse";
  }
  return null;
}

export const parseHHMM = (v: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};
