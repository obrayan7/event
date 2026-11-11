"use server";

import { redirect } from "next/navigation";
import sharp from "sharp";
import { CartError, prisma, recordBankProof } from "@rideau/db";
import { notifyAdminsOfProof } from "@/lib/bank";
import { allow } from "@/lib/rate-limit";

// Limite d'envoi : 5 Mo par défaut ; sur Vercel (corps de requête limité à 4,5 Mo) définir MAX_UPLOAD_MB=4
const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/** Type réel du fichier d'après son contenu (et non son nom ou le type annoncé par le navigateur). */
function sniff(b: Buffer): "image" | "pdf" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image";
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

/** Envoi de la preuve de virement (capture d'écran ou PDF) depuis la page de commande. */
export async function submitPaymentProof(token: string, formData: FormData) {
  const back = (msg: string): never => redirect(`/commande/${token}?error=${encodeURIComponent(msg)}`);
  if (!allow(`proof:${token}`, 6, 60 * 60_000)) back("Trop d'envois pour cette commande. Réessayez dans une heure.");

  const order = await prisma.order.findUnique({
    where: { accessToken: token },
    include: { payments: { where: { provider: "BANK_TRANSFER" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const payment = order?.payments[0];
  if (!order || !payment) back("Commande introuvable.");

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) back("Sélectionnez la capture ou le fichier de votre preuve de virement.");
  const f = file as File;
  if (f.size > MAX_BYTES) back(`Fichier trop volumineux (${MAX_MB} Mo maximum).`);

  const raw = Buffer.from(await f.arrayBuffer());
  const kind = sniff(raw);
  if (!kind) back("Format non accepté : envoyez une image (JPG, PNG, WebP) ou un PDF.");

  let data: Buffer = raw;
  let mimeType = "application/pdf";
  let ext = "pdf";
  if (kind === "image") {
    try {
      // Ré-encodage : retire les métadonnées (position GPS…) et réduit le poids, sans perte de lisibilité
      data = await sharp(raw).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      mimeType = "image/jpeg";
      ext = "jpg";
    } catch {
      back("Image illisible. Essayez avec une autre capture.");
    }
  }
  const base = (f.name.split(/[\\/]/).pop() ?? "preuve").replace(/\.[^.]+$/, "").replace(/[^\w .-]/g, "").trim().slice(0, 60) || "preuve";

  try {
    await recordBankProof({ paymentId: payment!.id, filename: `${base}.${ext}`, mimeType, data });
  } catch (e) {
    if (e instanceof CartError) back(e.message);
    throw e;
  }
  await notifyAdminsOfProof({ paymentId: payment!.id, orderId: order!.id, totalCents: order!.totalCents, email: order!.email });
  redirect(`/commande/${token}?proof=1`);
}
