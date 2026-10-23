// Contraseña del WiFi (Hotspot) de un usuario. Funciones puras.

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres que se confunden (0/O, 1/l/I)

/** Contraseña aleatoria fácil de dictar. `bytes` son bytes aleatorios (por ejemplo de crypto.randomBytes). */
export function generateWifiPassword(bytes: Uint8Array, length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Mensaje de error o null si la contraseña escrita por el administrador sirve. */
export function validateWifiPassword(pw: string): string | null {
  if (pw.length < 6) return "La contraseña del WiFi debe tener al menos 6 caracteres";
  if (pw.length > 64) return "La contraseña del WiFi no puede tener más de 64 caracteres";
  if (/[\u0000-\u001f\u007f"\\]/.test(pw)) return "La contraseña no puede llevar comillas, barras invertidas ni caracteres de control";
  return null;
}
