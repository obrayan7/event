import Stripe from "stripe";
import type { Cart } from "./cart";
import { siteUrl } from "./env";

let client: Stripe | null = null;
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant");
  return (client ??= new Stripe(key));
}

/** Session Stripe Checkout (3D Secure / DSP2, Apple Pay et Google Pay gérés par Stripe). */
export async function createCheckoutSession(cart: Cart, email: string) {
  return getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"], // cartes uniquement (Visa / Mastercard)
    locale: "fr",
    customer_email: email,
    client_reference_id: cart.id,
    metadata: { orderId: cart.id },
    line_items: cart.items.map((i) => ({
      quantity: i.quantity,
      price_data: {
        currency: "eur",
        unit_amount: i.unitCents,
        product_data: { name: `${i.ticketType.event.title} - ${i.ticketType.name}` },
      },
    })),
    success_url: `${siteUrl()}/commande/${cart.accessToken}`,
    cancel_url: `${siteUrl()}/paiement`,
    // Stripe impose 30 minutes minimum : marge de sécurité
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  });
}
