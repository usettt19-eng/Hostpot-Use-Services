"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { title: string | null; items: NavItem[] };

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M17 14c2.6 0 4.6 2 4.6 4.6" /></>,
  gauge: <><path d="M4 17a8 8 0 1 1 16 0" /><path d="M12 17l4-5" /></>,
  device: <><rect x="4" y="8" width="16" height="8" rx="2" /><path d="M7 8V4h10v4M7 14h10v6H7z" /></>,
  portal: <><rect x="3" y="4" width="18" height="15" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></>,
  guest: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>,
  live: <path d="M2 12h4l3-8 4 16 3-8h6" />,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" />,
  data: <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></>,
  building: <path d="M4 21V4h10v17M14 9h6v12M3 21h18M8 8h2M8 12h2M8 16h2" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Menú lateral con la sección actual marcada. En pantallas pequeñas se abre con un botón. */
export default function AppNav({ groups, brand, initial, footer }: { groups: NavGroup[]; brand: string; initial: string; footer: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const isActive = (href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(href + "/"));

  return (
    <>
      <div className="mbar">
        <span className="brand"><i>{initial}</i>{brand}</span>
        <button className="ghost menu-btn" aria-expanded={open} aria-controls="sidenav" onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      <aside className={`side${open ? " open" : ""}`} id="sidenav">
        <div className="brand desk"><i>{initial}</i><span>{brand}</span></div>
        <nav aria-label="Principal">
          {groups.map((g, gi) => (
            <div className="navgroup" key={gi}>
              {g.title && <p className="navtitle">{g.title}</p>}
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={isActive(it.href) ? "on" : ""} aria-current={isActive(it.href) ? "page" : undefined}>
                  <Icon name={it.icon} />{it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidefoot">{footer}</div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}
