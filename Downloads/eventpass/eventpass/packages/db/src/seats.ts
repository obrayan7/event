/** Aides pour le plan de salle : fonctions pures, sans accès à la base. */

/** 0 → A, 25 → Z, 26 → AA… */
export function rowLabel(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** A → 0, Z → 25, AA → 26… */
export function rowIndex(label: string): number {
  let n = 0;
  for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const isRowLabel = (s: string) => /^[A-Za-z]{1,2}$/.test(s.trim());

/** Tri naturel des rangs : A, B … Z, AA, AB… */
export const compareRows = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

/** Rangées × places. `gapAfter` = laisse une allée après ce numéro de place. */
export function buildSeatGrid(o: { rowStart: string; rows: number; perRow: number; gapAfter?: number | null }) {
  const start = rowIndex(o.rowStart);
  const gap = o.gapAfter && o.gapAfter > 0 ? o.gapAfter : 0;
  const seats: { row: string; number: number; col: number; label: string }[] = [];
  for (let r = 0; r < o.rows; r++) {
    const row = rowLabel(start + r);
    for (let n = 1; n <= o.perRow; n++) {
      seats.push({ row, number: n, col: n - 1 + (gap && n > gap ? 1 : 0), label: `${row}${n}` });
    }
  }
  return seats;
}

/** Couleurs des catégories sur le plan (assez sombres pour un texte blanc). La plus chère reçoit la première. */
export const CATEGORY_COLORS = ["#b3195a", "#0f6a73", "#4a3fb5", "#a35a00", "#2a7a2e", "#1a56b8", "#7a3b9a", "#8a5a2b"];

export function categoryColors(types: { id: string; name: string; priceCents: number }[]): Record<string, string> {
  const sorted = [...types].sort((a, b) => b.priceCents - a.priceCents || a.name.localeCompare(b.name));
  return Object.fromEntries(sorted.map((t, i) => [t.id, CATEGORY_COLORS[i % CATEGORY_COLORS.length]]));
}
