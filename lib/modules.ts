// Módulos habilitables por establecimiento. El dueño de la plataforma los activa en /platform; todo lo de un módulo
// (menú, pantallas, rutas públicas y flujos) debe comprobar que esté activo. Función pura: sin acceso a datos.

/** `notFor`: tipos de establecimiento a los que el módulo NO se puede aplicar (el dueño no puede activarlo y, si quedara activo, no funciona). */
export const MODULES: Record<string, { label: string; description: string; notFor?: readonly string[] }> = {
  guest_profile: {
    label: "Preguntas al visitante",
    description: "Preguntas opcionales al conectarse (¿vive aquí o está de visita?, tiempo de estancia, motivo…) para segmentar promociones y ver quién visita el local. No aplica a escuelas (menores de edad).",
    notFor: ["school"],
  },
  promotions: {
    label: "Promociones",
    description: "Campañas que el visitante ve justo después de conectarse, segmentadas por nuevos, recurrentes o ausentes.",
  },
};

export type ModuleKey = "guest_profile" | "promotions";
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];
export const isModuleKey = (k: string): k is ModuleKey => Object.prototype.hasOwnProperty.call(MODULES, k);

/** ¿El módulo se puede usar en este tipo de establecimiento? */
export const moduleAppliesTo = (key: string, tenantType: string): boolean =>
  isModuleKey(key) && !MODULES[key].notFor?.includes(tenantType);
