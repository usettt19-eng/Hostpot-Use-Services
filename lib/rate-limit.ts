// Límite de intentos en memoria (ventana deslizante). Vale mientras haya un solo proceso del portal;
// con varias réplicas hay que moverlo a un almacén compartido.

const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

/** Devuelve true si el intento está permitido (y lo registra); false si se superó el límite en la ventana. */
export function allow(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    if (hits.size > MAX_KEYS) hits.clear(); // última defensa contra el crecimiento sin límite
  }
  return true;
}

export function resetRateLimits() {
  hits.clear();
}
