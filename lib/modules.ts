// Módulos habilitables por establecimiento. El dueño de la plataforma los activa en /platform; todo lo de un módulo
// (menú, pantallas, rutas públicas y flujos) debe comprobar que esté activo. Función pura: sin acceso a datos.

export const MODULES = {
  promotions: {
    label: "Promociones",
    description: "Campañas que el visitante ve justo después de conectarse, segmentadas por nuevos, recurrentes o ausentes.",
  },
} as const;

export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];
export const isModuleKey = (k: string): k is ModuleKey => Object.prototype.hasOwnProperty.call(MODULES, k);
