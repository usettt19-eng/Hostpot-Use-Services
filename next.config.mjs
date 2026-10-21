const guestCsp = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'", // Next inyecta scripts de arranque; los clientes no pueden añadir código propio
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "2mb" } }, // subida de logo y fondo
  async headers() {
    return [
      // Portal del invitado: no se puede incrustar en otros sitios
      { source: "/w/:path*", headers: [...common, { key: "Content-Security-Policy", value: `${guestCsp}; frame-ancestors 'none'` }, { key: "X-Frame-Options", value: "DENY" }] },
      // Vista previa dentro del editor: solo desde este mismo sitio
      { source: "/preview/:path*", headers: [...common, { key: "Content-Security-Policy", value: `${guestCsp}; frame-ancestors 'self'` }, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};
export default nextConfig;
