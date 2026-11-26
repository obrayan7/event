import { siteName } from "./site";

type Attachment = { filename: string; content: Buffer };

/**
 * Envoi d'e-mails via l'API Resend (https://resend.com). Sans RESEND_API_KEY (développement),
 * le message est simplement écrit dans la console.
 */
export async function sendMail(input: { to: string; subject: string; html: string; attachments?: Attachment[] }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? `${siteName()} <billets@example.com>`;
  if (!key) {
    console.log(`[mail:dev] À: ${input.to} | Objet: ${input.subject}\n${input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    if (input.attachments?.length) console.log(`[mail:dev] ${input.attachments.length} pièce(s) jointe(s)`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  if (!res.ok) throw new Error(`Envoi e-mail refusé (${res.status}) : ${await res.text()}`);
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
