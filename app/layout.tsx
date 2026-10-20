import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Portal de Red WiFi", description: "Administración de ancho de banda MikroTik multi-establecimiento" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
