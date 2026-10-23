import "./globals.css";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

export const metadata = { title: SITE.name, description: "Portal de bienvenida, usuarios y visitantes de tu red WiFi" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
