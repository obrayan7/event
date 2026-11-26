"use client";

import { useMemo, useState } from "react";

export type PickerSeat = {
  id: string; label: string; row: string; number: number; col: number;
  categoryId: string; categoryName: string; priceCents: number;
  status: "available" | "taken" | "blocked";
};
export type PickerCategory = { id: string; name: string; priceCents: number; color: string };

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const price = (cents: number) => eur.format(cents / 100);

/**
 * Plan de salle interactif : le client choisit ses places, voit le prix de chacune (selon sa catégorie) et le total.
 * Chaque place est un vrai bouton (clavier et lecteurs d'écran) ; la couleur n'est pas le seul indicateur :
 * l'état est aussi dans l'étiquette vocale, et la sélection affiche « ✓ ».
 */
export function SeatPicker({
  seats, categories, maxSeats, action,
}: { seats: PickerSeat[]; categories: PickerCategory[]; maxSeats: number; action: (formData: FormData) => void | Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const byId = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  const colors = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.color])), [categories]);
  const rows = useMemo(() => {
    const map = new Map<string, PickerSeat[]>();
    for (const s of seats) map.set(s.row, [...(map.get(s.row) ?? []), s]); // les places arrivent déjà triées
    return [...map.entries()];
  }, [seats]);
  const maxCol = useMemo(() => Math.max(0, ...seats.map((s) => s.col)), [seats]);

  const chosen = selected.map((id) => byId.get(id)).filter((s): s is PickerSeat => Boolean(s));
  const total = chosen.reduce((n, s) => n + s.priceCents, 0);
  const full = selected.length >= maxSeats;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= maxSeats ? cur : [...cur, id]));

  return (
    <form action={action} className="seatpicker">
      <ul className="legend" aria-label="Catégories de places">
        {categories.map((c) => (
          <li key={c.id}><span className="swatch" style={{ background: c.color }} aria-hidden="true" />{c.name} — <strong>{price(c.priceCents)}</strong></li>
        ))}
        <li><span className="swatch taken" aria-hidden="true" />Indisponible</li>
        <li><span className="swatch picked" aria-hidden="true" />Votre choix</li>
      </ul>

      <p className="hint seat-hint">Faites glisser le plan vers la gauche ou la droite pour voir toutes les places.</p>
      <div className="stage" aria-hidden="true">SCÈNE</div>
      <div className="seatmap-scroll" role="group" aria-label="Plan de la salle : choisissez vos places">
        <div className="seatmap">
          {rows.map(([row, list]) => (
            <div className="seatrow" key={row}>
              <span className="rowlabel" aria-hidden="true">{row}</span>
              <div className="seatline" style={{ gridTemplateColumns: `repeat(${maxCol + 1}, var(--seat))` }}>
                {list.map((s) => {
                  const isSel = selected.includes(s.id);
                  const free = s.status === "available";
                  const state = isSel ? "sélectionnée" : free ? "disponible" : "indisponible";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`seat${free ? "" : " off"}`}
                      style={{ gridColumn: s.col + 1, ...(free ? { background: colors[s.categoryId] } : {}) }}
                      disabled={!free || (!isSel && full)}
                      aria-pressed={isSel}
                      aria-label={`Rang ${s.row}, place ${s.number}, ${s.categoryName}, ${price(s.priceCents)}, ${state}`}
                      title={`${s.label} — ${s.categoryName} — ${price(s.priceCents)}`}
                      onClick={() => toggle(s.id)}
                    >
                      {isSel ? "✓" : s.number}
                    </button>
                  );
                })}
              </div>
              <span className="rowlabel" aria-hidden="true">{row}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="picked-box" aria-live="polite">
        <h3>Vos places ({selected.length}/{maxSeats})</h3>
        {chosen.length === 0 ? <p className="hint">Cliquez sur une place libre du plan pour la sélectionner.</p> : (
          <ul className="picked-list">
            {chosen.map((s) => (
              <li key={s.id}>
                <span><strong>{s.label}</strong> — {s.categoryName}</span>
                <span>{price(s.priceCents)} <button type="button" className="btn-ghost x" onClick={() => toggle(s.id)} aria-label={`Retirer la place ${s.label}`}>✕</button></span>
              </li>
            ))}
          </ul>
        )}
        {full && <p className="hint">Maximum {maxSeats} places par commande.</p>}
        {chosen.map((s) => <input key={s.id} type="hidden" name="seat" value={s.id} />)}
        <div className="total"><span>Total</span><strong>{price(total)}</strong></div>
        <button type="submit" style={{ width: "100%" }} disabled={chosen.length === 0}>Ajouter {chosen.length > 0 ? `${chosen.length} place${chosen.length > 1 ? "s" : ""} ` : ""}au panier</button>
        <p className="hint" style={{ margin: "10px 0 0" }}>Vos places sont réservées 15 minutes une fois ajoutées au panier.</p>
      </div>
    </form>
  );
}
