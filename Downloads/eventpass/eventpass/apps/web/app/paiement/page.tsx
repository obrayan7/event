import Link from "next/link";
import { redirect } from "next/navigation";
import { formatPrice } from "@rideau/db";
import { startCheckout } from "@/app/actions/checkout";
import { CountdownTimer } from "@/components/CountdownTimer";
import { getCart } from "@/lib/cart";
import { getCustomer } from "@/lib/customer-auth";
import { bankEnabled, bankHoldHours } from "@/lib/bank";
import { cardEnabled, cryptoEnabled, cryptoSandbox, stripeTestMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paiement" };

export default async function CheckoutPage({ searchParams }: { searchParams: { error?: string } }) {
  const cart = await getCart();
  if (!cart) redirect("/panier");
  const customer = await getCustomer();
  const card = cardEnabled();
  const crypto = cryptoEnabled();
  const bank = await bankEnabled();

  return (
    <div className="wrap page">
      <h1>Paiement</h1>
      <CountdownTimer expiresAt={cart.expiresAt.toISOString()} />
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      {((card && stripeTestMode()) || (crypto && cryptoSandbox())) && (
        <p className="alert" role="status">
          Mode test : {[card && stripeTestMode() && "les paiements par carte", crypto && cryptoSandbox() && "les paiements crypto"].filter(Boolean).join(", ")} ne débitent aucun argent réel.
        </p>
      )}

      <div className="checkout">
        <section aria-labelledby="recap">
          <h2 id="recap">Récapitulatif</h2>
          {cart.items.map((i) => (
            <div className="tt" key={i.id}>
              <div><strong>{i.ticketType.event.title}</strong><small>{i.ticketType.name} × {i.quantity}{cart.seats.some((os) => os.seat.ticketTypeId === i.ticketTypeId) ? ` — places ${cart.seats.filter((os) => os.seat.ticketTypeId === i.ticketTypeId).map((os) => os.seat.label).join(", ")}` : ""}</small></div>
              <span>{formatPrice(i.quantity * i.unitCents)}</span>
            </div>
          ))}
          <div className="total"><span>Total TTC</span><strong>{formatPrice(cart.totalCents)}</strong></div>
          <p><Link href="/panier">Modifier mon panier</Link></p>
        </section>

        <form action={startCheckout} className="form panel" style={{ position: "static" }}>
          <h2>Vos coordonnées</h2>
          <label>Nom et prénom du titulaire <span className="hint">(imprimé sur les billets)</span>
            <input name="name" required minLength={2} maxLength={80} defaultValue={customer?.name ?? cart.holderName ?? ""} autoComplete="name" />
          </label>
          <label>Adresse e-mail <span className="hint">(vos billets y seront envoyés)</span>
            <input type="email" name="email" required defaultValue={customer?.email ?? cart.email ?? ""} autoComplete="email" />
          </label>
          {!customer && <p className="hint">Pas besoin de compte : vous recevrez un lien pour retrouver vos billets. <Link href="/compte/connexion">Se connecter</Link></p>}

          <fieldset>
            <legend>Moyen de paiement</legend>
            {!card && !crypto && !bank && <p className="alert">Aucun moyen de paiement n&apos;est configuré pour le moment.</p>}
            {card && (
              <label className="radio"><input type="radio" name="method" value="card" defaultChecked required />
                <span><strong>Carte Visa ou Mastercard</strong><small>Paiement en euros, sécurisé par Stripe (authentification 3D Secure).</small></span>
              </label>
            )}
            {crypto && (
              <label className="radio"><input type="radio" name="method" value="crypto" defaultChecked={!card} required />
                <span><strong>Cryptomonnaie</strong><small>Le montant est calculé en euros ; vous choisissez votre crypto sur la page de paiement</small></span>
              </label>
            )}
            {bank && (
              <label className="radio"><input type="radio" name="method" value="bank" defaultChecked={!card && !crypto} required />
                <span><strong>Virement bancaire</strong><small>Vous recevez nos coordonnées bancaires, puis vous nous envoyez la preuve du virement. Billets émis après vérification ; places réservées {bankHoldHours()} h.</small></span>
              </label>
            )}
          </fieldset>

          <label className="check">
            <input type="checkbox" name="cgv" required />
            <span>J&apos;ai lu et j&apos;accepte les <Link href="/cgv" target="_blank">conditions générales de vente</Link>.</span>
          </label>
          <p className="hint">Les billets de spectacle à date déterminée ne bénéficient pas du droit de rétractation de 14 jours (article L221-28 du Code de la consommation).</p>
          <button type="submit" disabled={!card && !crypto && !bank}>Payer {formatPrice(cart.totalCents)}</button>
        </form>
      </div>
    </div>
  );
}
