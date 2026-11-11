import { describe, expect, it } from "vitest";
import { buildSeatGrid, categoryColors, compareRows, rowIndex, rowLabel } from "../src/seats";

describe("rangs", () => {
  it("convertit A→0, Z→25, AA→26 dans les deux sens", () => {
    expect(rowLabel(0)).toBe("A");
    expect(rowLabel(25)).toBe("Z");
    expect(rowLabel(26)).toBe("AA");
    expect(rowLabel(27)).toBe("AB");
    for (const i of [0, 1, 25, 26, 51, 52, 100]) expect(rowIndex(rowLabel(i))).toBe(i);
  });
  it("trie A, B … Z puis AA", () => {
    expect(["AA", "B", "Z", "A"].sort(compareRows)).toEqual(["A", "B", "Z", "AA"]);
  });
});

describe("génération d'une grille de places", () => {
  it("crée rangées × places avec des libellés uniques", () => {
    const grid = buildSeatGrid({ rowStart: "C", rows: 2, perRow: 3 });
    expect(grid.map((s) => s.label)).toEqual(["C1", "C2", "C3", "D1", "D2", "D3"]);
    expect(new Set(grid.map((s) => s.label)).size).toBe(grid.length);
  });
  it("laisse une allée après la place indiquée", () => {
    const grid = buildSeatGrid({ rowStart: "A", rows: 1, perRow: 6, gapAfter: 3 });
    expect(grid.map((s) => s.col)).toEqual([0, 1, 2, 4, 5, 6]); // la colonne 3 reste vide
  });
  it("sans allée : colonnes contiguës", () => {
    expect(buildSeatGrid({ rowStart: "A", rows: 1, perRow: 4 }).map((s) => s.col)).toEqual([0, 1, 2, 3]);
  });
});

describe("couleurs des catégories", () => {
  it("donne la première couleur à la catégorie la plus chère, de façon stable", () => {
    const colors = categoryColors([
      { id: "a", name: "Galerie", priceCents: 2000 },
      { id: "b", name: "VIP", priceCents: 9000 },
      { id: "c", name: "Orchestre", priceCents: 5000 },
    ]);
    expect(colors.b).not.toBe(colors.c);
    expect(new Set(Object.values(colors)).size).toBe(3);
    expect(categoryColors([{ id: "b", name: "VIP", priceCents: 9000 }]).b).toBe(colors.b);
  });
});
