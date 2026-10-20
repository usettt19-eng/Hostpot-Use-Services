export const ROLES = ["director", "staff", "teacher", "student"] as const;

export const ROLE_LABEL: Record<string, string> = {
  superadmin: "Administrador",
  director: "Directivo",
  staff: "Staff",
  teacher: "Docente",
  student: "Estudiante",
};
