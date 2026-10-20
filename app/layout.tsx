import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Portal de Red Escolar", description: "Administración de ancho de banda MikroTik multi-escuela" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
