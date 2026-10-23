"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { FaqGroup } from "@/lib/faq";

/** `**negrita**` y `código` en los textos del FAQ. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p
  );
}
const plain = (t: string) => t.replace(/\*\*|`/g, "").toLowerCase();

export default function Faq({ groups }: { groups: FaqGroup[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = useMemo(
    () => groups
      .map((g) => ({ ...g, items: g.items.filter((it) => !term || plain([it.q, ...it.a, ...(it.steps ?? [])].join(" ")).includes(term)) }))
      .filter((g) => g.items.length),
    [groups, term]
  );
  const total = shown.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <div className="card faqtop">
        <label htmlFor="faq-q">Buscar en las preguntas</label>
        <input id="faq-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Por ejemplo: contraseña, horario, impresora…" autoComplete="off" />
        {!term && (
          <p className="faqjump">
            {groups.map((g) => <a key={g.id} href={`#${g.id}`}>{g.title}</a>)}
          </p>
        )}
        {term && <p className="muted" role="status">{total === 0 ? "No hay resultados. Prueba con otra palabra." : `${total} ${total === 1 ? "resultado" : "resultados"}`}</p>}
      </div>
      {shown.map((g) => (
        <section key={g.id} id={g.id} className="faqgroup">
          <h2>{g.title}</h2>
          {g.items.map((it) => (
            <details key={it.q} className="faq" open={!!term}>
              <summary>{it.q}</summary>
              <div className="faqbody">
                {it.a.map((p, i) => <p key={i}>{rich(p)}</p>)}
                {it.steps && <ol>{it.steps.map((s, i) => <li key={i}>{rich(s)}</li>)}</ol>}
              </div>
            </details>
          ))}
        </section>
      ))}
    </>
  );
}
