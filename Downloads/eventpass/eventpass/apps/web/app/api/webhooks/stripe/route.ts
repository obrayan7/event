import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markPaymentFailed, prisma } from "@rideau/db";
import { completeOrder } from "@/lib/fulfillment";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // émission des billets + PDF + e-mail

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook non configuré" }, { status: 400 });

  const body = await req.text(); // corps brut, indispensable pour vérifier la signature
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId && session.payment_status === "paid") {
          const order = await prisma.order.findUnique({ where: { id: orderId }, select: { totalCents: true } });
          // Garde-fou : le montant payé doit correspondre à la commande
          if (order && session.amount_total === order.totalCents && session.currency === "eur") {
            await completeOrder(orderId, "STRIPE");
          } else {
            console.error(`[stripe] Montant incohérent pour la commande ${orderId}`);
          }
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.orderId) {
          await markPaymentFailed({
            orderId: session.metadata.orderId,
            provider: "STRIPE",
            status: event.type === "checkout.session.expired" ? "EXPIRED" : "FAILED",
          });
        }
        break;
      }
    }
  } catch (e) {
    console.error("[stripe] erreur de traitement du webhook :", e);
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 }); // Stripe réessaiera
  }
  return NextResponse.json({ received: true });
}
