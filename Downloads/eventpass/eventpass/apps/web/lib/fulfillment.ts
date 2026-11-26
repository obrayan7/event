import { getOrderByToken, markOrderPaid, prisma, type PaymentProvider } from "@rideau/db";
import { orderConfirmationEmail } from "./emails";
import { sendMail } from "./mail";
import { buildTicketsPdf, ticketsFromOrder } from "./ticket-pdf";

/**
 * Appelée par les webhooks de paiement : confirme la commande, émet les billets
 * puis envoie l'e-mail (une seule fois, grâce à l'idempotence de markOrderPaid).
 */
export async function completeOrder(orderId: string, provider: PaymentProvider) {
  const outcome = await markOrderPaid({ orderId, provider });
  if (outcome.reason === "no_stock" || outcome.reason === "cancelled") {
    console.error(`[paiement] Commande ${orderId} payée mais non validable (${outcome.reason}) : traitement manuel requis.`);
  }
  if (!outcome.issued) return outcome;

  try {
    const row = await prisma.order.findUnique({ where: { id: orderId }, select: { accessToken: true, email: true } });
    if (!row?.email) return outcome;
    const order = await getOrderByToken(row.accessToken);
    if (!order) return outcome;
    const pdf = await buildTicketsPdf(ticketsFromOrder(order));
    const mail = orderConfirmationEmail(order);
    await sendMail({ to: row.email, subject: mail.subject, html: mail.html, attachments: [{ filename: "billets.pdf", content: pdf }] });
  } catch (e) {
    // Les billets restent téléchargeables depuis la page de commande même si l'e-mail échoue
    console.error("[e-mail] échec d'envoi de la confirmation :", e);
  }
  return outcome;
}
