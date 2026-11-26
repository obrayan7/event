"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createPayment, extendReservation, prisma, setCheckoutInfo } from "@rideau/db";
import { bankHoldHours, bankReference, listBankAccounts } from "@/lib/bank";
import { clearCartCookie, getCart } from "@/lib/cart";
import { getCustomer } from "@/lib/customer-auth";
import { bankInstructionsEmail } from "@/lib/emails";
import { cardEnabled, cryptoEnabled, siteUrl } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { createInvoice } from "@/lib/nowpayments";
import { createCheckoutSession } from "@/lib/stripe";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(80),
  method: z.enum(["card", "crypto", "bank"]),
  cgv: z.literal("on"),
});

const fail = (error: string): never => redirect(`/paiement?error=${encodeURIComponent(error)}`);

export async function startCheckout(formData: FormData) {
  const cart = await getCart();
  if (!cart) redirect("/panier");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const missingCgv = !formData.get("cgv");
    fail(missingCgv ? "Vous devez accepter les conditions générales de vente." : "Vérifiez votre nom, votre adresse e-mail et le moyen de paiement.");
  }
  const { email, name, method } = parsed.data!;
  if ((method === "card" && !cardEnabled()) || (method === "crypto" && !cryptoEnabled())) fail("Ce moyen de paiement n'est pas disponible.");

  const customer = await getCustomer();
  await setCheckoutInfo(cart!.id, { email, holderName: name, userId: customer?.id });

  // ---------- Virement bancaire : coordonnées envoyées, puis preuve de paiement vérifiée par l'admin ----------
  if (method === "bank") {
    let target = "";
    try {
      const accounts = await listBankAccounts();
      if (accounts.length === 0) fail("Le virement bancaire n'est pas disponible pour le moment.");
      const reference = bankReference(cart!.id);
      await extendReservation(cart!.id, bankHoldHours() * 60);
      const existing = await prisma.payment.findFirst({
        where: { orderId: cart!.id, provider: "BANK_TRANSFER", status: { in: ["PENDING", "PROOF_SUBMITTED", "REJECTED"] } },
      });
      if (!existing) await createPayment({ orderId: cart!.id, provider: "BANK_TRANSFER", externalId: `VIR-${reference}`, amountCents: cart!.totalCents });

      target = `/commande/${cart!.accessToken}`;
      const mail = bankInstructionsEmail({ totalCents: cart!.totalCents, reference, link: `${siteUrl()}${target}`, hours: bankHoldHours(), accounts });
      await sendMail({ to: email, subject: mail.subject, html: mail.html }).catch((e) => console.error("[e-mail] coordonnées bancaires :", e));
      clearCartCookie(); // la commande n'est plus modifiable : on repart d'un panier vide
    } catch (e) {
      if (isRedirect(e)) throw e;
      console.error("[virement] échec :", e);
      fail("Le virement n'a pas pu être initialisé. Réessayez dans un instant.");
    }
    redirect(target);
  }

  let url: string | null = null;
  try {
    if (method === "card") {
      await extendReservation(cart!.id, 32); // la session Stripe dure 31 minutes
      const session = await createCheckoutSession(cart!, email);
      await createPayment({ orderId: cart!.id, provider: "STRIPE", externalId: session.id, amountCents: cart!.totalCents, checkoutUrl: session.url });
      url = session.url;
    } else {
      await extendReservation(cart!.id, 20);
      const invoice = await createInvoice(cart!);
      await createPayment({ orderId: cart!.id, provider: "CRYPTO", externalId: invoice.id, amountCents: cart!.totalCents, checkoutUrl: invoice.url });
      url = invoice.url;
    }
  } catch (e) {
    console.error("[paiement] échec de création :", e);
    fail("Le paiement n'a pas pu être initialisé. Réessayez dans un instant.");
  }
  if (!url) fail("Le paiement n'a pas pu être initialisé.");
  redirect(url!);
}

/** Les redirections Next.js sont des exceptions : elles ne doivent jamais être avalées par un try/catch. */
function isRedirect(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
