import { NextResponse } from "next/server";
import { markPaymentFailed, prisma } from "@rideau/db";
import { completeOrder } from "@/lib/fulfillment";
import { verifySignature } from "@/lib/nowpayments";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // émission des billets + PDF + e-mail

type Ipn = { payment_status?: string; order_id?: string; price_amount?: number | string; price_currency?: string };

export async function POST(req: Request) {
  let payload: Ipn;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }
  if (!verifySignature(payload, req.headers.get("x-nowpayments-sig"))) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const orderId = payload.order_id;
  if (!orderId) return NextResponse.json({ received: true });

  try {
    switch (payload.payment_status) {
      case "confirmed":
      case "finished": {
        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { totalCents: true } });
        const amountOk = order && Math.round(Number(payload.price_amount) * 100) === order.totalCents && payload.price_currency?.toLowerCase() === "eur";
        if (amountOk) await completeOrder(orderId, "CRYPTO");
        else console.error(`[crypto] Montant incohérent pour la commande ${orderId}`);
        break;
      }
      case "expired":
        await markPaymentFailed({ orderId, provider: "CRYPTO", status: "EXPIRED" });
        break;
      case "failed":
        await markPaymentFailed({ orderId, provider: "CRYPTO", status: "FAILED" });
        break;
      // waiting, confirming, sending… : rien à faire, la commande reste en attente
    }
  } catch (e) {
    console.error("[crypto] erreur de traitement du webhook :", e);
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
