export const ESTABLISHMENT_TYPES = ["school", "restaurant", "pub", "hotel"] as const;
export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];

export const ESTABLISHMENT_LABEL: Record<EstablishmentType, string> = {
  school: "Escuela",
  restaurant: "Restaurante",
  pub: "Pub / Bar",
  hotel: "Hotel",
};

/** Roles que puede pedir/recibir un usuario según el tipo de establecimiento (sin 'superadmin', que solo crea el fundador). */
export const ROLES_BY_TYPE: Record<EstablishmentType, readonly string[]> = {
  school: ["director", "staff", "teacher", "student"],
  restaurant: ["manager", "employee", "customer"],
  pub: ["manager", "employee", "customer"],
  hotel: ["manager", "employee", "guest"],
};

/** Rol por defecto (el de menor privilegio) de cada tipo */
export const DEFAULT_ROLE: Record<EstablishmentType, string> = {
  school: "student",
  restaurant: "customer",
  pub: "customer",
  hotel: "guest",
};

export const ADMIN_ROLES = ["superadmin", "director", "manager"];
export const isAdminRole = (role: string) => ADMIN_ROLES.includes(role);

export const isEstablishmentType = (t: string): t is EstablishmentType =>
  (ESTABLISHMENT_TYPES as readonly string[]).includes(t);

export const rolesFor = (type: string): readonly string[] =>
  isEstablishmentType(type) ? ROLES_BY_TYPE[type] : ROLES_BY_TYPE.school;

export const ROLE_LABEL: Record<string, string> = {
  superadmin: "Administrador",
  director: "Directivo",
  staff: "Staff",
  teacher: "Docente",
  student: "Estudiante",
  manager: "Gerente",
  employee: "Empleado",
  customer: "Cliente",
  guest: "Huésped",
};
