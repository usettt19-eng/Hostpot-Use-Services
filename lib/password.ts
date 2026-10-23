// Reglas para la contraseña de acceso al panel. Funciones puras.

export const MIN_PASSWORD = 10;

/** Devuelve un mensaje de error o null si la contraseña nueva es aceptable. `current` es null cuando no hay contraseña actual (recuperación). */
export function validateNewPassword(current: string | null, next: string, confirm: string): string | null {
  if (current !== null && !current) return "Escribe tu contraseña actual";
  if (next.length < MIN_PASSWORD) return `La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres`;
  if (next.length > 72) return "La contraseña nueva no puede tener más de 72 caracteres";
  if (next !== confirm) return "La confirmación no coincide con la contraseña nueva";
  if (current !== null && next === current) return "La contraseña nueva debe ser distinta de la actual";
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return "Usa letras y números en la contraseña nueva";
  if (/^(.)\1+$/.test(next)) return "Esa contraseña es demasiado simple";
  return null;
}
