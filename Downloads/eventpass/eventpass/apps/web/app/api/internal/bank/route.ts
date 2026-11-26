import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@rideau/db";
import { proofRejectedEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/env";
import { completeOrder } from "@/lib/fulfillment";
import { sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // émission des billets + PDF + e-mail

const body = z.object({
  action: z.enum(["confirm", "reject"]),
  paymentId: z.string().min(1),
  reviewer: z.string().min(1).max(200),
  reason: z.string().trim().min(5).max(500).optional(),
});

function authorized(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  const got = req.headers.get("x-internal-secret");
  if (!secret || secret.length < 16 || !got) return false;
  const a = Buffer.from(secret), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * API interne : appelée UNIQUEMENT par l'espace admin (secret partagé INTERNAL_API_SECRET).
 * Elle confirme ou refuse un virement. La confirmation émet les billets et envoie l'e-mail avec les PDF.
 * En production, le reverse proxy ne doit pas exposer /api/internal/* sur Internet (voir Caddyfile).
 */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide (un motif de 5 caractères minimum est requis pour un refus)." }, { status: 400 });
  const { action, paymentId, reviewer, reason } = parsed.data;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { id: true, status: true, email: true, accessToken: true } } },
  });
  if (!payment || payment.provider !== "BANK_TRANSFER") return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });

  if (action === "confirm") {
    if (!["PENDING", "PROOF_SUBMITTED", "REJECTED", "EXPIRED"].includes(payment.status)) {
      return NextResponse.json({ error: payment.status === "PAID" ? "Ce virement est déjà confirmé." : "Ce paiement ne peut plus être confirmé." }, { status: 409 });
    }
    const outcome = await completeOrder(payment.orderId, "BANK_TRANSFER");
    if (outcome.reason === "no_stock") {
      return NextResponse.json({ error: "Les places ne sont plus disponibles (la réservation avait expiré et elles ont été vendues). Remboursez le client par virement." }, { status: 409 });
    }
    if (outcome.reason === "cancelled" || outcome.reason === "not_found") {
      return NextResponse.json({ error: "La commande a été annulée : aucun billet n'a été émis." }, { status: 409 });
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { reviewedAt: new Date(), reviewedBy: reviewer, rejectionReason: null } });
    return NextResponse.json({ ok: true, issued: outcome.issued, alreadyPaid: outcome.reason === "already_paid" });
  }

  // refus : le client peut renvoyer une nouvelle preuve
  if (!reason) return NextResponse.json({ error: "Indiquez le motif du refus (5 caractères minimum)." }, { status: 400 });
  if (!["PENDING", "PROOF_SUBMITTED"].includes(payment.status)) return NextResponse.json({ error: "Ce paiement ne peut plus être refusé." }, { status: 409 });
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "REJECTED", rejectionReason: reason, reviewedAt: new Date(), reviewedBy: reviewer } });
  if (payment.order.email) {
    const mail = proofRejectedEmail({ link: `${siteUrl()}/commande/${payment.order.accessToken}`, reason });
    await sendMail({ to: payment.order.email, subject: mail.subject, html: mail.html }).catch((e) => console.error("[e-mail] refus de preuve :", e));
  }
  return NextResponse.json({ ok: true });
}
