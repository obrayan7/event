import { prisma } from "@rideau/db";
import { adminProofEmail } from "./emails";
import { sendMail } from "./mail";

/** Durée pendant laquelle les places restent réservées en attendant le virement (heures). */
export const bankHoldHours = () => {
  const n = Number(process.env.BANK_HOLD_HOURS);
  return Number.isFinite(n) && n >= 1 && n <= 168 ? Math.round(n) : 48;
};

/** Référence à indiquer dans le libellé du virement. */
export const bankReference = (orderId: string) => orderId.slice(-8).toUpperCase();

export const listBankAccounts = () => prisma.bankAccount.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
export const bankEnabled = async () => (await prisma.bankAccount.count({ where: { active: true } })) > 0;

/** Prévient les administrateurs qu'une preuve est à vérifier (échec d'envoi sans conséquence : la preuve est dans l'admin). */
export async function notifyAdminsOfProof(input: { paymentId: string; orderId: string; totalCents: number; email: string | null }) {
  try {
    const configured = (process.env.BANK_NOTIFY_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const recipients = configured.length ? configured : (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })).map((u) => u.email);
    const base = (process.env.ADMIN_URL ?? "").replace(/\/$/, "");
    const mail = adminProofEmail({ link: `${base}/virements/${input.paymentId}`, reference: bankReference(input.orderId), totalCents: input.totalCents, email: input.email });
    await Promise.all(recipients.map((to) => sendMail({ to, subject: mail.subject, html: mail.html }).catch((e) => console.error("[e-mail] notification admin :", e))));
  } catch (e) {
    console.error("[virement] notification des administrateurs impossible :", e);
  }
}
