"use client";

import { useMemo, useState } from "react";

export type EditorSeat = {
  id: string; label: string; row: string; number: number; col: number;
  categoryId: string; categoryName: string; priceCents: number;
  status: "available" | "taken" | "blocked";
};
export type EditorCategory = { id: string; name: string; priceCents: number; color: string };

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const price = (c: number) => eur.format(c / 100);

/**
 * Éditeur du plan de salle : on coche des places (une à une, par rang, par catégorie…) puis on applique une action :
 * changer de catégorie (donc de prix), bloquer / débloquer, supprimer. Les places vendues ou réservées ne sont pas modifiables.
 */
export function SeatEditor({
  seats, categories, action,
}: { seats: EditorSeat[]; categories: EditorCategory[]; action: (formData: FormData) => void | Promise<void> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const colors = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.color])), [categories]);
  const rows = useMemo(() => {
    const map = new Map<string, EditorSeat[]>();
    for (const s of seats) map.set(s.row, [...(map.get(s.row) ?? []), s]);
    return [...map.entries()];
  }, [seats]);
  const maxCol = useMemo(() => Math.max(0, ...seats.map((s) => s.col)), [seats]);
  const editable = (s: EditorSeat) => s.status !== "taken";

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectWhere = (pred: (s: EditorSeat) => boolean) => setSelected(new Set(seats.filter((s) => editable(s) && pred(s)).map((s) => s.id)));
  const toggleRow = (list: EditorSeat[]) =>
    setSelected((cur) => {
      const ids = list.filter(editable).map((s) => s.id);
      const all = ids.every((id) => cur.has(id));
      const n = new Set(cur);
      ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });

  return (
    <form action={action} className="sm-form">
      <ul className="sm-legend" aria-label="Catégories">
        {categories.map((c) => (
          <li key={c.id}>
            <button type="button" className="sm-cat" onClick={() => selectWhere((s) => s.categoryId === c.id)} title="Sélectionner toutes les places de cette catégorie">
              <span className="sm-swatch" style={{ background: c.color }} aria-hidden="true" />{c.name} — {price(c.priceCents)}
            </button>
          </li>
        ))}
        <li><span className="sm-swatch taken" aria-hidden="true" /> Vendue / réservée</li>
        <li><span className="sm-swatch blocked" aria-hidden="true" /> Bloquée</li>
      </ul>

      <div className="sm-toolbar">
        <strong>{selected.size} place{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}</strong>
        <button type="button" className="btn-ghost btn-sm" onClick={() => selectWhere(() => true)}>Tout sélectionner</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Effacer la sélection</button>
      </div>

      <div className="sm-stage" aria-hidden="true">SCÈNE</div>
      <div className="sm-scroll" role="group" aria-label="Plan de salle : cochez les places à modifier">
        <div className="sm-map">
          {rows.map(([row, list]) => (
            <div className="sm-row" key={row}>
              <button type="button" className="sm-rowbtn" onClick={() => toggleRow(list)} aria-label={`Sélectionner tout le rang ${row}`}>{row}</button>
              <div className="sm-line" style={{ gridTemplateColumns: `repeat(${maxCol + 1}, 30px)` }}>
                {list.map((s) => {
                  const isSel = selected.has(s.id);
                  const state = s.status === "taken" ? "vendue ou réservée" : s.status === "blocked" ? "bloquée" : "libre";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`sm-seat ${s.status}${isSel ? " sel" : ""}`}
                      style={{ gridColumn: s.col + 1, ...(s.status === "available" || s.status === "blocked" ? { ["--c" as string]: colors[s.categoryId] } : {}) }}
                      disabled={!editable(s)}
                      aria-pressed={isSel}
                      aria-label={`Rang ${s.row}, place ${s.number}, ${s.categoryName}, ${price(s.priceCents)}, ${state}${isSel ? ", sélectionnée" : ""}`}
                      title={`${s.label} — ${s.categoryName} — ${price(s.priceCents)} — ${state}`}
                      onClick={() => toggle(s.id)}
                    >
                      {isSel ? "✓" : s.number}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {[...selected].map((id) => <input key={id} type="hidden" name="seat" value={id} />)}

      <div className="sm-actions card" style={{ marginTop: 16 }}>
        <div className="sm-apply">
          <label>Appliquer une catégorie (et donc son prix) aux places cochées
            <select name="ticketTypeId" defaultValue="">
              <option value="" disabled>Choisir une catégorie…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} — {price(c.priceCents)}</option>)}
            </select>
          </label>
          <button type="submit" name="intent" value="category" disabled={selected.size === 0}>Changer la catégorie</button>
        </div>
        <div className="sm-more">
          <button type="submit" name="intent" value="block" className="btn-ghost" disabled={selected.size === 0}>Bloquer (retirer de la vente)</button>
          <button type="submit" name="intent" value="unblock" className="btn-ghost" disabled={selected.size === 0}>Débloquer</button>
          <button
            type="submit" name="intent" value="delete" className="btn-danger" disabled={selected.size === 0}
            onClick={(e) => { if (!window.confirm(`Supprimer définitivement ${selected.size} place(s) du plan ?`)) e.preventDefault(); }}
          >Supprimer</button>
        </div>
      </div>
    </form>
  );
}
