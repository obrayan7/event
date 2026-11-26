"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { buildSeatGrid, prisma } from "@rideau/db";
import { requireAdmin } from "@/lib/auth";

const MAX_SEATS_PER_EVENT = 3000;

const back = (eventId: string, error: string): never => redirect(`/evenements/${eventId}?error=${encodeURIComponent(error)}#plan`);
const done = (eventId: string): never => {
  revalidatePath(`/evenements/${eventId}`);
  redirect(`/evenements/${eventId}?saved=1#plan`);
};

/** En places numérotées, la quantité d'une catégorie = nombre de places non bloquées qu'elle contient. */
async function syncQuantities(eventId: string) {
  const types = await prisma.ticketType.findMany({ where: { eventId }, select: { id: true } });
  for (const t of types) {
    const quantity = await prisma.seat.count({ where: { ticketTypeId: t.id, blocked: false } });
    await prisma.ticketType.update({ where: { id: t.id }, data: { quantity } });
  }
}

const generateSchema = z.object({
  ticketTypeId: z.string().min(1),
  rowStart: z.string().trim().toUpperCase().regex(/^[A-Z]{1,2}$/),
  rows: z.coerce.number().int().min(1).max(26),
  perRow: z.coerce.number().int().min(1).max(60),
  gapAfter: z.coerce.number().int().min(0).max(60).optional(),
});

/** Ajoute des rangées de places (ex. rangs A à F, 12 places par rang) à une catégorie. */
export async function generateSeats(eventId: string, formData: FormData) {
  await requireAdmin();
  const parsed = generateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(eventId, "Rangées invalides : choisissez une catégorie, la lettre du premier rang (A), le nombre de rangs (1 à 26) et de places par rang (1 à 60).");
  const d = parsed.data!;

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { seatingMode: true } });
  if (event?.seatingMode !== "ASSIGNED") back(eventId, "Passez d'abord l'événement en « Places numérotées » (section Informations), puis enregistrez.");
  const category = await prisma.ticketType.findFirst({ where: { id: d.ticketTypeId, eventId }, select: { id: true } });
  if (!category) back(eventId, "Catégorie introuvable.");

  const grid = buildSeatGrid({ rowStart: d.rowStart, rows: d.rows, perRow: d.perRow, gapAfter: d.gapAfter || null });
  if ((await prisma.seat.count({ where: { eventId } })) + grid.length > MAX_SEATS_PER_EVENT) back(eventId, `Un événement ne peut pas dépasser ${MAX_SEATS_PER_EVENT} places.`);
  const clash = await prisma.seat.findMany({ where: { eventId, label: { in: grid.map((s) => s.label) } }, select: { row: true }, distinct: ["row"] });
  if (clash.length > 0) back(eventId, `Ces rangs existent déjà : ${clash.map((c) => c.row).join(", ")}. Choisissez une autre lettre de départ.`);

  await prisma.seat.createMany({ data: grid.map((s) => ({ ...s, eventId, ticketTypeId: d.ticketTypeId })) });
  await syncQuantities(eventId);
  done(eventId);
}

/** Actions groupées sur les places cochées : changer de catégorie (donc de prix), bloquer / débloquer, supprimer. */
export async function bulkSeats(eventId: string, formData: FormData) {
  await requireAdmin();
  const intent = String(formData.get("intent") ?? "");
  const ids = [...new Set(formData.getAll("seat").map(String))];
  if (ids.length === 0) back(eventId, "Cochez d'abord une ou plusieurs places sur le plan.");

  const seats = await prisma.seat.findMany({ where: { id: { in: ids }, eventId }, select: { id: true } });
  if (seats.length !== ids.length) back(eventId, "Certaines places n'appartiennent pas à cet événement.");

  // Une place vendue ou en cours de réservation ne peut plus être modifiée
  const active = await prisma.orderSeat.findMany({
    where: { seatId: { in: ids }, order: { OR: [{ status: "PAID" }, { status: "PENDING", expiresAt: { gt: new Date() } }] } },
    select: { seatId: true },
    distinct: ["seatId"],
  });
  if (active.length > 0) back(eventId, `${active.length} place${active.length > 1 ? "s sont vendues ou réservées" : " est vendue ou réservée"} et ne peut pas être modifiée : décochez-la.`);

  if (intent === "category") {
    const ticketTypeId = String(formData.get("ticketTypeId") ?? "");
    if (!(await prisma.ticketType.findFirst({ where: { id: ticketTypeId, eventId }, select: { id: true } }))) back(eventId, "Choisissez la catégorie à appliquer.");
    await prisma.seat.updateMany({ where: { id: { in: ids } }, data: { ticketTypeId } });
  } else if (intent === "block" || intent === "unblock") {
    await prisma.seat.updateMany({ where: { id: { in: ids } }, data: { blocked: intent === "block" } });
  } else if (intent === "delete") {
    await prisma.orderSeat.deleteMany({ where: { seatId: { in: ids } } }); // restes de commandes expirées ou annulées
    await prisma.seat.deleteMany({ where: { id: { in: ids } } });
  } else {
    back(eventId, "Action inconnue.");
  }
  await syncQuantities(eventId);
  done(eventId);
}
