// Constantes y utilidades de tema del portal. Sin dependencias: se usan en cliente y servidor.

export const TEMPLATES = ["card", "split", "full"] as const;
export const RADII = ["sm", "md", "lg"] as const;
export const FONTS = ["system", "serif", "rounded", "mono"] as const;
export const LOCALES = ["es", "en"] as const;
export const METHODS = ["email", "phone", "voucher"] as const;
export const FIELD_MODES = ["off", "optional", "required"] as const;

export const TEMPLATE_LABEL: Record<(typeof TEMPLATES)[number], string> = {
  card: "Tarjeta centrada",
  split: "Imagen dividida",
  full: "Fondo completo",
};
export const RADIUS_LABEL: Record<(typeof RADII)[number], string> = { sm: "Pequeño", md: "Medio", lg: "Grande" };
export const FONT_LABEL: Record<(typeof FONTS)[number], string> = {
  system: "Sistema",
  serif: "Con serifa",
  rounded: "Redondeada",
  mono: "Monoespaciada",
};
export const METHOD_LABEL: Record<(typeof METHODS)[number], string> = {
  email: "Correo",
  phone: "Teléfono",
  voucher: "Código (voucher)",
};
export const FIELD_MODE_LABEL: Record<(typeof FIELD_MODES)[number], string> = {
  off: "No pedir",
  optional: "Opcional",
  required: "Obligatorio",
};

// Pilas de fuentes del sistema: no se cargan tipografías externas (privacidad y walled garden)
export const FONT_STACK: Record<(typeof FONTS)[number], string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};
export const RADIUS_PX: Record<(typeof RADII)[number], number> = { sm: 4, md: 10, lg: 20 };

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Luminancia relativa WCAG 2.x */
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Relación de contraste WCAG entre dos colores #RRGGBB (de 1 a 21) */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Color de texto (blanco o negro) más legible sobre un fondo */
export const readableOn = (bg: string) => (contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg) ? "#ffffff" : "#000000");

export const MIN_CONTRAST = 4.5;
