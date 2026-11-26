import Link from "next/link";
import { formatDate, formatPrice } from "@rideau/db";
import { emptyCart, removeFromCart, removeSeat, setQuantity } from "@/app/actions/cart";
import { compareRows } from "@rideau/db";
import { CountdownTimer } from "@/components/CountdownTimer";
import { getCart } from "@/lib/cart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon panier" };

export default async function CartPage({ searchParams }: { searchParams: { error?: string } }) {
  const cart = await getCart();

  if (!cart) {
    return (
      <div className="wrap page">
        <h1>Mon panier</h1>
        {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
        <p>Votre panier est vide. Si vous aviez des places réservées, le délai de 15 minutes est peut-être écoulé.</p>
        <Link className="btn" href="/">Voir les spectacles</Link>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <h1>Mon panier</h1>
      <CountdownTimer expiresAt={cart.expiresAt.toISOString()} />
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}

      <div className="lines">
        {cart.items.map((i) => {
          const seatLines = cart.seats
            .filter((os) => os.seat.ticketTypeId === i.ticketTypeId)
            .sort((x, y) => compareRows(x.seat.row, y.seat.row) || x.seat.number - y.seat.number);
          return (
            <div className="line" key={i.id} style={seatLines.length > 0 ? { gridTemplateColumns: "1fr auto" } : undefined}>
              <div>
                <strong>{i.ticketType.event.title}</strong>
                <div className="hint">{i.ticketType.name} — {formatDate(i.ticketType.event.startsAt, true)}</div>
                <div className="hint">{i.ticketType.event.venue.name}, {i.ticketType.event.venue.city}</div>
                {seatLines.length > 0 && (
                  <ul className="seat-chips" aria-label={`Places ${i.ticketType.name}`}>
                    {seatLines.map((os) => (
                      <li key={os.id}>
                        <span>{os.seat.label}</span>
                        <form action={removeSeat.bind(null, os.seatId)}><button type="submit" aria-label={`Retirer la place ${os.seat.label}`}>✕</button></form>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {seatLines.length === 0 && (
                <form action={setQuantity.bind(null, i.ticketTypeId)} className="qty">
                  <label className="sr">Quantité
                    <input type="number" name="quantity" min={1} max={i.ticketType.maxPerOrder} defaultValue={i.quantity} style={{ width: 72 }} />
                  </label>
                  <button type="submit" className="btn-ghost btn">Modifier</button>
                </form>
              )}
              <strong className="amount">{formatPrice(i.quantity * i.unitCents)}</strong>
              {seatLines.length === 0 && (
                <form action={removeFromCart.bind(null, i.ticketTypeId)}>
                  <button type="submit" className="btn-ghost btn" aria-label={`Retirer ${i.ticketType.name}`}>Retirer</button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <div className="total">
        <span>Total TTC</span>
        <strong>{formatPrice(cart.totalCents)}</strong>
      </div>
      <div className="actions-row">
        <form action={emptyCart}><button type="submit" className="btn-ghost btn">Vider le panier</button></form>
        <Link className="btn" href="/paiement">Passer au paiement</Link>
      </div>
    </div>
  );
}
