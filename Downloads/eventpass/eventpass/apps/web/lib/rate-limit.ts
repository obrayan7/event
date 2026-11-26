// Limitation en mémoire (une instance). À remplacer par Redis / Upstash en multi-instances.
const hits = new Map<string, number[]>();

/** Retourne true si l'action est autorisée, false si la limite est atteinte. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
