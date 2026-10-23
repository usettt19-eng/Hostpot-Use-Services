import { delta } from "@/lib/stats";

export const nf = new Intl.NumberFormat("es");

function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw);
  const out: number[] = [];
  for (let v = 0; v <= max + step - 1e-9; v += step) out.push(Math.round(v));
  return out;
}

type Col = { label: string; tip: string; a: number; b?: number };

/** Columnas SVG (una o dos series apiladas). Cada columna lleva su <title> como tooltip. */
export function Columns({ cols, aName, bName, every, aria }: { cols: Col[]; aName: string; bName?: string; every: number; aria: string }) {
  const W = 640, H = 220, L = 34, T = 10, B = 26;
  const iw = W - L - 6, ih = H - T - B;
  const max = Math.max(0, ...cols.map((c) => c.a + (c.b ?? 0)));
  const tk = ticks(max);
  const top = tk[tk.length - 1] || 1;
  const slot = iw / cols.length;
  const bw = Math.min(24, Math.max(2, slot - 2));
  const y = (v: number) => T + ih - (v / top) * ih;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
      {tk.map((v) => (
        <g key={v}>
          <line className="grid" x1={L} x2={W - 6} y1={y(v)} y2={y(v)} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{v >= 1000 ? `${v / 1000}K` : v}</text>
        </g>
      ))}
      {cols.map((c, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        const ha = (c.a / top) * ih, hb = ((c.b ?? 0) / top) * ih;
        const r = Math.min(4, bw / 2);
        return (
          <g key={i} className="hit">
            <title>{`${c.tip}\n${aName}: ${nf.format(c.a)}${bName ? `\n${bName}: ${nf.format(c.b ?? 0)}` : ""}`}</title>
            <rect className="back" x={L + i * slot} y={T} width={slot} height={ih} />
            {c.a > 0 && <rect className="m1" x={x} y={y(c.a)} width={bw} height={ha} rx={hb > 0 ? 0 : r} />}
            {(c.b ?? 0) > 0 && <rect className="m2" x={x} y={y(c.a + (c.b ?? 0))} width={bw} height={Math.max(0, hb - (c.a > 0 ? 2 : 0))} rx={r} />}
            {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle">{c.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Kpi({ label, cur, prev, unit = "" }: { label: string; cur: number | null; prev: number | null; unit?: string }) {
  const d = cur !== null && prev !== null ? delta(cur, prev) : null;
  return (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className="v">{cur === null ? "—" : `${nf.format(Math.round(cur))}${unit}`}</div>
      <div className={`d ${d === null ? "" : d >= 0 ? "up" : "down"}`}>
        {d === null ? "Sin periodo anterior" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}% vs periodo anterior`}
      </div>
    </div>
  );
}

