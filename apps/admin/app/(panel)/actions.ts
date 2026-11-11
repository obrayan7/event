"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, slugify } from "@rideau/db";
import { requireAdmin } from "@/lib/auth";
import { deleteImageFiles, saveImage } from "@/lib/images";
import { parisToDate } from "@/lib/time";

const MAX_IMAGES_PER_EVENT = 12;

const eventSchema = z.object({
  title: z.string().trim().min(3).max(140),
  organizer: z.string().trim().max(120).optional(),
  description: z.string().trim().min(10),
  categoryId: z.string().min(1),
  venueId: z.string().min(1),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  seatingMode: z.enum(["GENERAL", "ASSIGNED"]).default("GENERAL"),
});

function fail(eventId: string, message: string): never {
  redirect(`/evenements/${eventId}?error=${encodeURIComponent(message)}`);
}

export async function createEvent(formData: FormData) {
  await requireAdmin();
  const parsed = eventSchema.safeParse({ ...Object.fromEntries(formData), status: "DRAFT" });
  if (!parsed.success) redirect(`/evenements/nouveau?error=${encodeURIComponent("Formulaire incomplet ou invalide.")}`);
  const d = parsed.data;
  const event = await prisma.event.create({
    data: {
      title: d.title,
      organizer: d.organizer || null,
      description: d.description,
      categoryId: d.categoryId,
      venueId: d.venueId,
      startsAt: parisToDate(d.startsAt),
      status: "DRAFT",
      seatingMode: d.seatingMode,
      slug: `${slugify(d.title)}-${randomBytes(2).toString("hex")}`,
    },
  });
  revalidatePath("/");
  redirect(`/evenements/${event.id}`);
}

export async function updateEvent(eventId: string, formData: FormData) {
  await requireAdmin();
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(eventId, "Formulaire incomplet ou invalide.");
  const d = parsed.data;

  const current = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { seatingMode: true } });
  if (d.seatingMode !== current.seatingMode) {
    if ((await prisma.orderItem.count({ where: { ticketType: { eventId } } })) > 0) fail(eventId, "Des commandes existent déjà pour cet événement : le mode de placement ne peut plus être changé.");
    if (d.seatingMode === "GENERAL" && (await prisma.seat.count({ where: { eventId } })) > 0) fail(eventId, "Supprimez d'abord toutes les places du plan de salle avant de revenir au placement libre.");
  }

  if (d.status === "PUBLISHED") {
    if (d.seatingMode === "ASSIGNED" && (await prisma.seat.count({ where: { eventId, blocked: false } })) === 0) fail(eventId, "Ajoutez des places au plan de salle avant de publier.");
    const [images, tickets] = await Promise.all([
      prisma.eventImage.count({ where: { eventId } }),
      prisma.ticketType.count({ where: { eventId } }),
    ]);
    if (images === 0) fail(eventId, "Ajoutez au moins une image (couverture) avant de publier.");
    if (tickets === 0) fail(eventId, "Ajoutez au moins un type de billet avant de publier.");
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: d.title,
      organizer: d.organizer || null,
      description: d.description,
      categoryId: d.categoryId,
      venueId: d.venueId,
      startsAt: parisToDate(d.startsAt),
      status: d.status,
      seatingMode: d.seatingMode,
    },
  });
  revalidatePath("/");
  redirect(`/evenements/${eventId}?saved=1`);
}

/**
 * Supprime un événement (images, catégories, places du plan). Refusé si des billets ont été vendus ou si un virement attend
 * sa vérification : l'historique comptable doit rester intact. Dans ce cas, passer l'événement en « Archivé » le retire du site.
 * Les paniers en cours qui le contiennent sont annulés.
 */
export async function deleteEvent(eventId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "SUPPRIMER") fail(eventId, "Pour supprimer, tapez le mot SUPPRIMER dans la case de confirmation.");

  const sold = await prisma.orderItem.count({ where: { ticketType: { eventId }, order: { status: "PAID" } } });
  if (sold > 0) fail(eventId, "Des billets ont été vendus pour cet événement : il ne peut pas être supprimé. Passez-le en « Archivé » pour le retirer du site.");
  const awaiting = await prisma.payment.count({ where: { status: "PROOF_SUBMITTED", order: { items: { some: { ticketType: { eventId } } } } } });
  if (awaiting > 0) fail(eventId, "Un virement concernant cet événement attend votre vérification : traitez-le d'abord (menu Virements).");

  const images = await prisma.eventImage.findMany({ where: { eventId }, select: { url: true } });
  await prisma.$transaction(async (tx) => {
    const orderIds = (await tx.orderItem.findMany({ where: { ticketType: { eventId } }, select: { orderId: true }, distinct: ["orderId"] })).map((o) => o.orderId);
    await tx.order.updateMany({ where: { id: { in: orderIds }, status: "PENDING" }, data: { status: "CANCELLED" } }); // paniers en cours
    await tx.orderSeat.deleteMany({ where: { seat: { eventId } } });
    await tx.orderItem.deleteMany({ where: { ticketType: { eventId } } });
    await tx.seat.deleteMany({ where: { eventId } });
    await tx.ticketType.deleteMany({ where: { eventId } });
    await tx.event.delete({ where: { id: eventId } }); // les images en base sont supprimées en cascade
  });
  for (const img of images) await deleteImageFiles(img.url).catch(() => {});
  console.info(`[audit] ${admin.email} a supprimé l'événement ${eventId}`);
  revalidatePath("/");
  redirect("/?deleted=1");
}

/* ---------- Types de billets / catégories de places ---------- */

const priceField = z.string().transform((s) => Math.round(parseFloat(s.replace(",", ".")) * 100)).pipe(z.number().int().min(0).max(1_000_000));
// Places numérotées : une catégorie = un nom et un prix (les places viennent du plan de salle)
const categorySchema = z.object({ name: z.string().trim().min(2).max(80), price: priceField });
// Placement libre : quantités et numérotation automatique
const ticketSchema = categorySchema.extend({
  quantity: z.coerce.number().int().min(1).max(100_000),
  maxPerOrder: z.coerce.number().int().min(1).max(20),
  seatPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{0,3}$/).optional(),
});

export async function addTicketType(eventId: string, formData: FormData) {
  await requireAdmin();
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { seatingMode: true } });
  if (!event) fail(eventId, "Événement introuvable.");
  if (event!.seatingMode === "ASSIGNED") {
    const parsed = categorySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) fail(eventId, "Catégorie invalide : vérifiez le nom et le prix.");
    await prisma.ticketType.create({ data: { eventId, name: parsed.data!.name, priceCents: parsed.data!.price, quantity: 0, maxPerOrder: 8 } });
  } else {
    const parsed = ticketSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) fail(eventId, "Type de billet invalide : vérifiez le nom, le prix et la quantité.");
    const { name, price, quantity, maxPerOrder, seatPrefix } = parsed.data!;
    await prisma.ticketType.create({ data: { eventId, name, priceCents: price, quantity, maxPerOrder, seatPrefix: seatPrefix || null } });
  }
  revalidatePath(`/evenements/${eventId}`);
  redirect(`/evenements/${eventId}?saved=1`);
}

/** Modifier le nom, le prix (et, en placement libre, la quantité) d'un billet / d'une catégorie. */
export async function updateTicketType(eventId: string, ticketTypeId: string, formData: FormData) {
  await requireAdmin();
  const tt = await prisma.ticketType.findFirst({ where: { id: ticketTypeId, eventId }, include: { event: { select: { seatingMode: true } } } });
  if (!tt) fail(eventId, "Billet introuvable.");
  if (tt!.event.seatingMode === "ASSIGNED") {
    const parsed = categorySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) fail(eventId, "Catégorie invalide : vérifiez le nom et le prix.");
    await prisma.ticketType.update({ where: { id: ticketTypeId }, data: { name: parsed.data!.name, priceCents: parsed.data!.price } });
  } else {
    const parsed = ticketSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) fail(eventId, "Billet invalide : vérifiez le nom, le prix et la quantité.");
    const { name, price, quantity, maxPerOrder, seatPrefix } = parsed.data!;
    const sold = await prisma.orderItem.aggregate({ _sum: { quantity: true }, where: { ticketTypeId, order: { status: "PAID" } } });
    if (quantity < (sold._sum.quantity ?? 0)) fail(eventId, `${sold._sum.quantity} billets sont déjà vendus : la quantité ne peut pas être inférieure.`);
    await prisma.ticketType.update({ where: { id: ticketTypeId }, data: { name, priceCents: price, quantity, maxPerOrder, seatPrefix: seatPrefix || null } });
  }
  revalidatePath(`/evenements/${eventId}`);
  redirect(`/evenements/${eventId}?saved=1`);
}

export async function deleteTicketType(eventId: string, ticketTypeId: string) {
  await requireAdmin();
  const sold = await prisma.orderItem.count({ where: { ticketTypeId } });
  if (sold > 0) fail(eventId, "Ce billet a déjà été commandé : il ne peut plus être supprimé.");
  if ((await prisma.seat.count({ where: { ticketTypeId } })) > 0) fail(eventId, "Cette catégorie contient encore des places du plan : changez leur catégorie ou supprimez-les d'abord.");
  await prisma.ticketType.delete({ where: { id: ticketTypeId } });
  revalidatePath(`/evenements/${eventId}`);
  redirect(`/evenements/${eventId}`);
}

/* ---------- Images ---------- */

export async function uploadImages(eventId: string, formData: FormData) {
  await requireAdmin();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) fail(eventId, "Sélectionnez au moins une image.");
  const alt = String(formData.get("alt") ?? "").trim() || null;

  const existing = await prisma.eventImage.findMany({ where: { eventId }, orderBy: { position: "asc" } });
  if (existing.length + files.length > MAX_IMAGES_PER_EVENT) fail(eventId, `Maximum ${MAX_IMAGES_PER_EVENT} images par événement.`);

  let position = existing.length ? Math.max(...existing.map((i) => i.position)) + 1 : 0;
  let hasCover = existing.some((i) => i.isCover);
  const saved: string[] = [];
  try {
    for (const file of files) {
      const url = await saveImage(file);
      saved.push(url);
      await prisma.eventImage.create({ data: { eventId, url, alt, position: position++, isCover: !hasCover } });
      hasCover = true;
    }
  } catch (e) {
    fail(eventId, e instanceof Error ? e.message : "Échec du téléversement.");
  }
  revalidatePath(`/evenements/${eventId}`);
  redirect(`/evenements/${eventId}?saved=1`);
}

export async function setCover(eventId: string, imageId: string) {
  await requireAdmin();
  await prisma.$transaction([
    prisma.eventImage.updateMany({ where: { eventId }, data: { isCover: false } }),
    prisma.eventImage.update({ where: { id: imageId }, data: { isCover: true } }),
  ]);
  revalidatePath(`/evenements/${eventId}`);
}

export async function moveImage(eventId: string, imageId: string, direction: "up" | "down") {
  await requireAdmin();
  const images = await prisma.eventImage.findMany({ where: { eventId }, orderBy: { position: "asc" } });
  const i = images.findIndex((img) => img.id === imageId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= images.length) return;
  // Réécrit des positions contiguës pour éviter les doublons
  const order = images.map((img) => img.id);
  [order[i], order[j]] = [order[j], order[i]];
  await prisma.$transaction(order.map((id, position) => prisma.eventImage.update({ where: { id }, data: { position } })));
  revalidatePath(`/evenements/${eventId}`);
}

export async function updateImageAlt(eventId: string, imageId: string, formData: FormData) {
  await requireAdmin();
  const alt = String(formData.get("alt") ?? "").trim() || null;
  await prisma.eventImage.update({ where: { id: imageId }, data: { alt } });
  revalidatePath(`/evenements/${eventId}`);
}

export async function deleteImage(eventId: string, imageId: string) {
  await requireAdmin();
  const image = await prisma.eventImage.findUnique({ where: { id: imageId } });
  if (!image || image.eventId !== eventId) return;
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { images: true } });
  if (event?.status === "PUBLISHED" && event.images.length === 1) {
    fail(eventId, "Un événement publié doit garder au moins une image. Passez-le en brouillon d'abord.");
  }
  await prisma.eventImage.delete({ where: { id: imageId } });
  await deleteImageFiles(image.url);
  if (image.isCover) {
    const next = await prisma.eventImage.findFirst({ where: { eventId }, orderBy: { position: "asc" } });
    if (next) await prisma.eventImage.update({ where: { id: next.id }, data: { isCover: true } });
  }
  revalidatePath(`/evenements/${eventId}`);
}
