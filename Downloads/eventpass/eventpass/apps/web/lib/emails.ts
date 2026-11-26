import { formatAccountNumber, formatDate, formatPrice, type FullOrder } from "@rideau/db";
import { siteUrl } from "./env";
import { escapeHtml } from "./mail";
import { siteLogo, siteName } from "./site";

/** Bandeau sombre avec le logo (image hébergée sur le site : elle s'affiche dès que le site est en ligne). */
const logoBand = () =>
  siteLogo()
    ? `<div style="background:#0b0a10;padding:16px 24px;text-align:center"><img src="${siteUrl()}/logo-email.png" alt="${escapeHtml(siteName())}" height="40" style="display:inline-block;height:40px;width:auto;color:#ffffff;font-weight:bold"></div>`
    : "";

const wrap = (title: string, body: string) => `<!doctype html><html lang="fr"><body style="margin:0;background:#f8f7fc;font-family:Arial,Helvetica,sans-serif;color:#1c1b2e">
${logoBand()}<div style="max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}
<p style="color:#666580;font-size:12px;margin-top:32px">${escapeHtml(siteName())} — cet e-mail est automatique.</p></div></body></html>`;

export function orderConfirmationEmail(order: FullOrder) {
  const link = `${siteUrl()}/commande/${order.accessToken}`;
  const lines = order.items
    .map((i) => `<li><strong>${escapeHtml(i.ticketType.event.title)}</strong> — ${escapeHtml(i.ticketType.name)} × ${i.quantity}<br>
      <span style="color:#666580">${escapeHtml(formatDate(i.ticketType.event.startsAt, true))}, ${escapeHtml(i.ticketType.event.venue.name)}, ${escapeHtml(i.ticketType.event.venue.city)}</span></li>`)
    .join("");
  return {
    subject: "Vos billets sont prêts",
    html: wrap("Merci pour votre commande",
      `<p>Votre paiement de <strong>${formatPrice(order.totalCents)}</strong> est confirmé. Vos billets sont en pièce jointe (PDF) : présentez le QR code à l'entrée.</p>
       <ul style="padding-left:18px;line-height:1.6">${lines}</ul>
       <p><a href="${link}" style="color:#d62f6b">Retrouver ma commande et mes billets</a></p>
       <p style="color:#666580;font-size:13px">Conservez ce lien : il donne accès à vos billets.</p>`),
  };
}

export function passwordResetEmail(resetLink: string) {
  return {
    subject: "Réinitialisation de votre mot de passe",
    html: wrap("Réinitialiser votre mot de passe",
      `<p>Vous avez demandé à changer votre mot de passe. Ce lien est valable 1 heure :</p>
       <p><a href="${resetLink}" style="color:#d62f6b">Choisir un nouveau mot de passe</a></p>
       <p style="color:#666580;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`),
  };
}

type BankAcc = { label: string; bankName: string; accountHolder: string; accountNumber: string; bic: string | null; instructions: string | null };

export function bankInstructionsEmail(p: { totalCents: number; reference: string; link: string; hours: number; accounts: BankAcc[] }) {
  const accounts = p.accounts
    .map((a) => `<div style="background:#fff;border:1px solid #e2e0ee;border-radius:10px;padding:12px 16px;margin:10px 0">
      <strong>${escapeHtml(a.label)}</strong><br>
      Banque : ${escapeHtml(a.bankName)}<br>
      Titulaire : ${escapeHtml(a.accountHolder)}<br>
      IBAN / compte : <strong>${escapeHtml(formatAccountNumber(a.accountNumber))}</strong>${a.bic ? `<br>BIC : ${escapeHtml(a.bic)}` : ""}
      ${a.instructions ? `<br><span style="color:#666580">${escapeHtml(a.instructions)}</span>` : ""}</div>`)
    .join("");
  return {
    subject: "Vos coordonnées bancaires pour régler votre commande",
    html: wrap("Payer par virement bancaire",
      `<p>Merci pour votre commande. Pour la régler, effectuez un virement de <strong>${formatPrice(p.totalCents)}</strong> vers :</p>${accounts}
       <p><strong>Référence à indiquer dans le libellé du virement : ${escapeHtml(p.reference)}</strong></p>
       <p>Une fois le virement effectué, envoyez la <strong>capture ou le justificatif</strong> depuis cette page :<br><a href="${p.link}" style="color:#d62f6b">Envoyer ma preuve de virement</a></p>
       <p style="color:#666580;font-size:13px">Vos places sont réservées pendant ${p.hours} h. Vos billets vous seront envoyés dès que nous aurons vérifié votre virement.</p>`),
  };
}

export function proofRejectedEmail(p: { link: string; reason: string }) {
  return {
    subject: "Votre preuve de virement n'a pas pu être validée",
    html: wrap("Preuve de virement non validée",
      `<p>Nous n'avons pas pu valider votre preuve de virement :</p>
       <p style="background:#fff;border:1px solid #e2e0ee;border-radius:10px;padding:12px 16px">${escapeHtml(p.reason)}</p>
       <p>Vous pouvez envoyer un nouveau justificatif depuis cette page :<br><a href="${p.link}" style="color:#d62f6b">Envoyer une nouvelle preuve</a></p>`),
  };
}

export function adminProofEmail(p: { link: string; reference: string; totalCents: number; email: string | null }) {
  return {
    subject: `Virement à vérifier — commande ${p.reference}`,
    html: wrap("Nouvelle preuve de virement",
      `<p>Un client a envoyé sa preuve de virement.</p>
       <ul><li>Commande : <strong>${escapeHtml(p.reference)}</strong></li><li>Montant attendu : <strong>${formatPrice(p.totalCents)}</strong></li><li>Client : ${escapeHtml(p.email ?? "—")}</li></ul>
       <p><a href="${p.link}" style="color:#d62f6b">Vérifier et confirmer</a></p>`),
  };
}
