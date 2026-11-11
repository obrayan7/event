import { randomBytes } from "crypto";
import { Prisma, type PaymentProvider } from "@prisma/client";
import { prisma } from "./client";
import { parseTicketNumber } from "./format";
import { compareRows } from "./seats";

/** Durée de réservation des places dans le panier. */
export const RESERVATION_MINUTES = 15;

/** Erreur « métier » dont le message peut être montré tel quel au client. */
export class CartError extends Error {}

type Tx = Prisma.TransactionClient;
const minutes = (n: number) => new Date(Date.now() + n * 60_000);

/**
 * Verrouille les lignes TicketType concernées (FOR UPDATE, dans un ordre stable pour éviter les deadlocks).
 * Deux réservations concurrentes sur le même billet sont ainsi traitées l'une après l'autre : pas de survente.
 */
async function lockTicketTypes(tx: Tx, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "TicketType" WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
}

/** Places prises = commandes payées + commandes en attente non expirées (hors commande `excludeOrderId`). */
async function takenSeats(tx: Tx, ids: string[], excludeOrderId?: string) {
  const rows = await tx.orderItem.groupBy({
    by: ["ticketTypeId"],
    where: {
      ticketTypeId: { in: ids },
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
      order: { OR: [{ status: "PAID" }, { status: "PENDING", expiresAt: { gt: new Date() } }] },
    },
    _sum: { quantity: true },
  });
  return Object.fromEntries(rows.map((r) => [r.ticketTypeId, r._sum.quantity ?? 0])) as Record<string, number>;
}

export type CartChange = { ticketTypeId: string; quantity: number; mode: "add" | "set" };

/**
 * Ajoute / modifie / retire des billets dans le panier (= une commande PENDING qui réserve les places).
 * Toute modification relance le compte à rebours de 15 minutes.
 * Retourne l'id de la commande, ou null si le panier est vide.
 */
export async function updateCart(params: { orderId?: string | null; changes: CartChange[]; userId?: string | null }) {
  const { changes } = params;
  for (const c of changes) {
    if (!Number.isInteger(c.quantity) || c.quantity < 0 || c.quantity > 100) throw new CartError("Quantité invalide.");
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const order = params.orderId
      ? await tx.order.findFirst({
          where: { id: params.orderId, status: "PENDING", expiresAt: { gt: now } },
          include: { items: true },
        })
      : null;

    const ids = changes.map((c) => c.ticketTypeId);
    await lockTicketTypes(tx, ids);

    const types = await tx.ticketType.findMany({ where: { id: { in: ids } }, include: { event: true } });
    const byId = new Map(types.map((t) => [t.id, t]));
    const taken = await takenSeats(tx, ids, order?.id);

    const desired = new Map<string, number>();
    for (const c of changes) {
      const tt = byId.get(c.ticketTypeId);
      if (!tt) throw new CartError("Ce billet n'existe plus.");
      if (tt.event.seatingMode === "ASSIGNED") throw new CartError("Cet événement se réserve place par place : choisissez vos sièges sur le plan.");
      const current = order?.items.find((i) => i.ticketTypeId === tt.id)?.quantity ?? 0;
      const qty = c.mode === "add" ? current + c.quantity : c.quantity;
      if (qty > 0) {
        if (tt.event.status !== "PUBLISHED" || tt.event.startsAt <= now) throw new CartError("Cet événement n'est plus en vente.");
        if (qty > tt.maxPerOrder) throw new CartError(`Maximum ${tt.maxPerOrder} billets « ${tt.name} » par commande.`);
        const available = tt.quantity - (taken[tt.id] ?? 0);
        if (qty > available) {
          throw new CartError(available <= 0 ? `« ${tt.name} » est complet.` : `Il ne reste que ${available} place${available > 1 ? "s" : ""} pour « ${tt.name} ».`);
        }
      }
      desired.set(tt.id, qty);
    }

    const needsOrder = [...desired.values()].some((q) => q > 0);
    let orderId = order?.id ?? null;
    if (!orderId && needsOrder) {
      const created = await tx.order.create({
        // Jeton d’accès à la commande : aléatoire cryptographique (un cuid est en partie prévisible)
        data: { userId: params.userId ?? null, accessToken: randomBytes(24).toString("base64url"), expiresAt: minutes(RESERVATION_MINUTES) },
      });
      orderId = created.id;
    }
    if (!orderId) return null;

    for (const [ticketTypeId, qty] of desired) {
      if (qty === 0) {
        await tx.orderItem.deleteMany({ where: { orderId, ticketTypeId } });
      } else {
        const tt = byId.get(ticketTypeId)!;
        await tx.orderItem.upsert({
          where: { orderId_ticketTypeId: { orderId, ticketTypeId } },
          create: { orderId, ticketTypeId, quantity: qty, unitCents: tt.priceCents },
          update: { quantity: qty, unitCents: tt.priceCents },
        });
      }
    }

    const items = await tx.orderItem.findMany({ where: { orderId } });
    if (items.length === 0) {
      await tx.order.delete({ where: { id: orderId } });
      return null;
    }
    await tx.order.update({
      where: { id: orderId },
      data: { totalCents: items.reduce((s, i) => s + i.quantity * i.unitCents, 0), expiresAt: minutes(RESERVATION_MINUTES) },
    });
    return orderId;
  });
}

/** Annule un panier / une commande non payée : les places sont libérées immédiatement. */
export async function cancelOrder(orderId: string) {
  await prisma.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

/**
 * Nettoyage : passe en EXPIRED les commandes en attente dont le délai est dépassé.
 * La disponibilité des places ne dépend PAS de cette tâche (elle ignore déjà les réservations expirées) :
 * c'est un rangement de statuts, exécuté par la tâche planifiée et à l'occasion des actions du panier.
 */
export async function expireOrders() {
  const now = new Date();
  const expired = await prisma.order.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, select: { id: true } });
  if (expired.length === 0) return 0;
  const ids = expired.map((o) => o.id);
  await prisma.$transaction([
    prisma.order.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "EXPIRED" } }),
    prisma.payment.updateMany({ where: { orderId: { in: ids }, status: "PENDING" }, data: { status: "EXPIRED" } }),
  ]);
  return ids.length;
}

/** Prolonge la réservation pendant le paiement (Stripe impose 30 minutes minimum pour une session). */
export async function extendReservation(orderId: string, minutesFromNow: number) {
  const target = minutes(minutesFromNow);
  await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING", expiresAt: { lt: target } },
    data: { expiresAt: target },
  });
}

export async function setCheckoutInfo(orderId: string, info: { email: string; holderName: string; userId?: string | null }) {
  await prisma.order.update({
    where: { id: orderId },
    data: { email: info.email, holderName: info.holderName, userId: info.userId ?? undefined, cgvAcceptedAt: new Date() },
  });
}

export async function createPayment(input: {
  orderId: string;
  provider: PaymentProvider;
  externalId: string;
  amountCents: number;
  checkoutUrl?: string | null;
}) {
  return prisma.payment.create({ data: { ...input, status: "PENDING" } });
}

export function newTicketCode() {
  return randomBytes(18).toString("base64url");
}

/**
 * Confirme le paiement d'une commande et émet les billets. Idempotent : peut être appelé plusieurs fois
 * (les prestataires renvoient leurs webhooks) sans créer de billets en double.
 *  - issued: true  → les billets viennent d'être émis (envoyer l'e-mail maintenant)
 *  - issued: false → déjà payée, ou commande introuvable / annulée / places plus disponibles
 */
export async function markOrderPaid(input: { orderId: string; provider: PaymentProvider }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true, seats: { include: { seat: true } } } });
    if (!order) return { issued: false as const, reason: "not_found" as const };

    await tx.payment.updateMany({
      where: { orderId: order.id, provider: input.provider, status: { in: ["PENDING", "EXPIRED", "PROOF_SUBMITTED", "REJECTED"] } },
      data: { status: "PAID" },
    });

    if (order.status === "PAID") return { issued: false as const, reason: "already_paid" as const };
    if (order.status === "CANCELLED") return { issued: false as const, reason: "cancelled" as const };

    // Verrou sur les billets et les places concernés : stock vérifié et attributions sans doublon, même en cas de paiements simultanés
    const ids = order.items.map((i) => i.ticketTypeId);
    const seatIds = order.seats.map((s) => s.seatId);
    await lockTicketTypes(tx, ids);
    await lockSeats(tx, seatIds);
    const types = await tx.ticketType.findMany({ where: { id: { in: ids } } });
    const seatedTypes = new Set(order.seats.map((s) => s.seat.ticketTypeId));

    // Réservation périmée (expirée, ou en attente dont le délai est dépassé) : on ne valide que si tout est encore libre.
    const stale = order.status === "EXPIRED" || (order.status === "PENDING" && order.expiresAt < new Date());
    if (stale) {
      const gaItems = order.items.filter((i) => !seatedTypes.has(i.ticketTypeId));
      const taken = await takenSeats(tx, gaItems.map((i) => i.ticketTypeId), order.id);
      const enough = gaItems.every((i) => {
        const tt = types.find((t) => t.id === i.ticketTypeId);
        return tt && tt.quantity - (taken[tt.id] ?? 0) >= i.quantity;
      });
      const seatsTaken = seatIds.length ? await tx.orderSeat.count({ where: { seatId: { in: seatIds }, ...activeSeatFilter(order.id) } }) : 0;
      if (!enough || seatsTaken > 0 || order.seats.some((s) => s.seat.blocked)) return { issued: false as const, reason: "no_stock" as const };
    }

    await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } });
    // Les autres tentatives de paiement de cette commande ne sont plus utilisables
    await tx.payment.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    for (const item of order.items) {
      if (seatedTypes.has(item.ticketTypeId)) {
        // Places numérotées : un billet par place choisie sur le plan
        const seats = order.seats
          .filter((s) => s.seat.ticketTypeId === item.ticketTypeId)
          .sort((x, y) => compareRows(x.seat.row, y.seat.row) || x.seat.number - y.seat.number);
        await tx.ticket.createMany({ data: seats.map((s) => ({ orderItemId: item.id, code: newTicketCode(), seat: s.seat.label, seatId: s.seatId })) });
        continue;
      }
      const tt = types.find((t) => t.id === item.ticketTypeId)!;
      // Numérotation automatique des sièges (A1, A2…) si le billet a un préfixe ; sinon placement libre
      const already = tt.seatPrefix ? await tx.ticket.count({ where: { orderItem: { ticketTypeId: tt.id } } }) : 0;
      await tx.ticket.createMany({
        data: Array.from({ length: item.quantity }, (_, i) => ({
          orderItemId: item.id,
          code: newTicketCode(),
          seat: tt.seatPrefix ? `${tt.seatPrefix}${already + i + 1}` : null,
        })),
      });
    }
    return { issued: true as const, reason: "issued" as const };
  });
}

export async function markPaymentFailed(input: { orderId: string; provider: PaymentProvider; status: "FAILED" | "EXPIRED" }) {
  await prisma.payment.updateMany({
    where: { orderId: input.orderId, provider: input.provider, status: "PENDING" },
    data: { status: input.status },
  });
}

/** Après envoi d’une preuve de virement, la réservation est maintenue le temps de la vérification par l’admin. */
export const BANK_REVIEW_DAYS = 7;
export const MAX_PROOFS_PER_PAYMENT = 5;

/** Enregistre une preuve de virement (fichier déjà contrôlé) et passe le paiement « en attente de vérification ». */
export async function recordBankProof(input: { paymentId: string; filename: string; mimeType: string; data: Buffer }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
    if (!payment || payment.provider !== "BANK_TRANSFER") throw new CartError("Paiement introuvable.");
    if (!["PENDING", "PROOF_SUBMITTED", "REJECTED", "EXPIRED"].includes(payment.status)) throw new CartError("Ce paiement n’attend plus de preuve.");
    if (!["PENDING", "EXPIRED"].includes(payment.order.status)) throw new CartError("Cette commande n’accepte plus de preuve de paiement.");
    if ((await tx.paymentProof.count({ where: { paymentId: payment.id } })) >= MAX_PROOFS_PER_PAYMENT) {
      throw new CartError(`Maximum ${MAX_PROOFS_PER_PAYMENT} documents par commande.`);
    }
    const proof = await tx.paymentProof.create({
      data: { paymentId: payment.id, filename: input.filename, mimeType: input.mimeType, size: input.data.length, data: input.data },
      select: { id: true },
    });
    await tx.payment.update({ where: { id: payment.id }, data: { status: "PROOF_SUBMITTED", rejectionReason: null } });
    if (payment.order.status === "PENDING") {
      const target = new Date(Date.now() + BANK_REVIEW_DAYS * 864e5);
      await tx.order.updateMany({ where: { id: payment.orderId, status: "PENDING", expiresAt: { lt: target } }, data: { expiresAt: target } });
    }
    return { proofId: proof.id, orderId: payment.orderId };
  });
}

/** Commande complète (articles, événement, billets, paiements) à partir de son jeton d'accès. */
export function getOrderByToken(accessToken: string) {
  return prisma.order.findUnique({
    where: { accessToken },
    include: {
      payments: { orderBy: { createdAt: "desc" }, include: { proofs: { select: { id: true, filename: true, createdAt: true } } } },
      items: {
        include: {
          ticketType: { include: { event: { include: { venue: true, images: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1 } } } } },
          tickets: { orderBy: { id: "asc" } },
        },
      },
    },
  });
}

export type FullOrder = NonNullable<Awaited<ReturnType<typeof getOrderByToken>>>;

/* ------------------------------------------------------------------ */
/* Places numérotées                                                   */
/* ------------------------------------------------------------------ */

export const MAX_SEATS_PER_ORDER = 8;

async function lockSeats(tx: Tx, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "Seat" WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
}

/** Une place est prise si elle figure dans une commande payée ou dans une commande en attente non expirée. */
function activeSeatFilter(excludeOrderId?: string): Prisma.OrderSeatWhereInput {
  return {
    ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
    order: { OR: [{ status: "PAID" }, { status: "PENDING", expiresAt: { gt: new Date() } }] },
  };
}

export type SeatView = {
  id: string; label: string; row: string; number: number; col: number;
  categoryId: string; categoryName: string; priceCents: number;
  status: "available" | "taken" | "blocked";
};

/** Plan de salle d’un événement avec l’état de chaque place. */
export async function getSeatMap(eventId: string): Promise<SeatView[]> {
  const seats = await prisma.seat.findMany({
    where: { eventId },
    include: {
      ticketType: { select: { id: true, name: true, priceCents: true } },
      orderSeats: { where: activeSeatFilter(), select: { id: true } },
    },
  });
  return seats
    .map((s) => ({
      id: s.id, label: s.label, row: s.row, number: s.number, col: s.col,
      categoryId: s.ticketType.id, categoryName: s.ticketType.name, priceCents: s.ticketType.priceCents,
      status: s.blocked ? ("blocked" as const) : s.orderSeats.length > 0 ? ("taken" as const) : ("available" as const),
    }))
    .sort((a, b) => compareRows(a.row, b.row) || a.number - b.number);
}

/**
 * Recalcule les lignes de commande des places numérotées (une ligne par catégorie), les prix (prix actuel de la catégorie),
 * le total et le délai de réservation. Supprime la commande si elle devient vide. Retourne l’id de la commande ou null.
 */
async function syncSeatItems(tx: Tx, orderId: string): Promise<string | null> {
  const orderSeats = await tx.orderSeat.findMany({ where: { orderId }, include: { seat: { include: { ticketType: true } } } });
  const byType = new Map<string, { count: number; unitCents: number }>();
  for (const os of orderSeats) {
    const price = os.seat.ticketType.priceCents;
    if (os.unitCents !== price) await tx.orderSeat.update({ where: { id: os.id }, data: { unitCents: price } });
    const e = byType.get(os.seat.ticketTypeId) ?? { count: 0, unitCents: price };
    e.count += 1;
    byType.set(os.seat.ticketTypeId, e);
  }
  const seatedItems = await tx.orderItem.findMany({ where: { orderId, ticketType: { event: { seatingMode: "ASSIGNED" } } } });
  for (const item of seatedItems) if (!byType.has(item.ticketTypeId)) await tx.orderItem.delete({ where: { id: item.id } });
  for (const [ticketTypeId, e] of byType) {
    await tx.orderItem.upsert({
      where: { orderId_ticketTypeId: { orderId, ticketTypeId } },
      create: { orderId, ticketTypeId, quantity: e.count, unitCents: e.unitCents },
      update: { quantity: e.count, unitCents: e.unitCents },
    });
  }
  const items = await tx.orderItem.findMany({ where: { orderId } });
  if (items.length === 0) {
    await tx.order.delete({ where: { id: orderId } });
    return null;
  }
  await tx.order.update({
    where: { id: orderId },
    data: { totalCents: items.reduce((s, i) => s + i.quantity * i.unitCents, 0), expiresAt: minutes(RESERVATION_MINUTES) },
  });
  return orderId;
}

/** Réserve des places choisies sur le plan (15 min). Atomique : deux acheteurs ne peuvent pas obtenir la même place. */
export async function reserveSeats(params: { orderId?: string | null; seatIds: string[]; userId?: string | null }): Promise<string> {
  const seatIds = [...new Set(params.seatIds)];
  if (seatIds.length === 0) throw new CartError("Sélectionnez au moins une place sur le plan.");
  if (seatIds.length > MAX_SEATS_PER_ORDER) throw new CartError(`Maximum ${MAX_SEATS_PER_ORDER} places par commande.`);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const order = params.orderId
      ? await tx.order.findFirst({ where: { id: params.orderId, status: "PENDING", expiresAt: { gt: now } }, include: { seats: { include: { seat: true } } } })
      : null;

    await lockSeats(tx, seatIds);
    const seats = await tx.seat.findMany({ where: { id: { in: seatIds } }, include: { event: true } });
    if (seats.length !== seatIds.length) throw new CartError("L’une de ces places n’existe plus.");
    if (new Set(seats.map((s) => s.eventId)).size > 1) throw new CartError("Réservez les places d’un seul événement à la fois.");

    const event = seats[0].event;
    if (event.status !== "PUBLISHED" || event.seatingMode !== "ASSIGNED" || event.startsAt <= now) throw new CartError("Cet événement n’est plus en vente.");
    if (seats.some((s) => s.blocked)) throw new CartError("L’une de ces places n’est pas disponible.");

    const already = order ? order.seats.filter((os) => os.seat.eventId === event.id && !seatIds.includes(os.seatId)).length : 0;
    if (already + seatIds.length > MAX_SEATS_PER_ORDER) throw new CartError(`Maximum ${MAX_SEATS_PER_ORDER} places par commande pour un même événement.`);

    const taken = await tx.orderSeat.findMany({ where: { seatId: { in: seatIds }, ...activeSeatFilter(order?.id) }, select: { seat: { select: { label: true } } } });
    if (taken.length > 0) {
      const labels = taken.map((t) => t.seat.label).join(", ");
      throw new CartError(`${taken.length > 1 ? "Ces places viennent" : "Cette place vient"} d’être prise${taken.length > 1 ? "s" : ""} : ${labels}. Choisissez-en d’autres.`);
    }

    let orderId = order?.id ?? null;
    if (!orderId) {
      const created = await tx.order.create({
        data: { userId: params.userId ?? null, accessToken: randomBytes(24).toString("base64url"), expiresAt: minutes(RESERVATION_MINUTES) },
      });
      orderId = created.id;
    }
    for (const seatId of seatIds) {
      await tx.orderSeat.upsert({ where: { orderId_seatId: { orderId, seatId } }, create: { orderId, seatId, unitCents: 0 }, update: {} });
    }
    return (await syncSeatItems(tx, orderId))!;
  });
}

/** Retire une place du panier (la place redevient disponible). Retourne l’id de la commande, ou null si le panier est vide. */
export async function releaseSeat(params: { orderId: string; seatId: string }): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: params.orderId, status: "PENDING" }, select: { id: true } });
    if (!order) return null;
    await tx.orderSeat.deleteMany({ where: { orderId: order.id, seatId: params.seatId } });
    return syncSeatItems(tx, order.id);
  });
}

/** Validation d'un billet à l'entrée (QR code ou numéro lisible) : accepté une seule fois, de façon atomique. */
export async function scanTicket(input: string) {
  const clean = input.trim();
  if (!clean) return { result: "invalid" as const };
  const serial = parseTicketNumber(clean);
  const where = serial !== null ? { serial } : { code: clean };
  const found = await prisma.ticket.findFirst({ where, select: { id: true } });
  if (!found) return { result: "invalid" as const };

  const updated = await prisma.ticket.updateMany({ where: { id: found.id, status: "VALID" }, data: { status: "USED", usedAt: new Date() } });
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: found.id },
    include: { orderItem: { include: { order: true, ticketType: { include: { event: true } } } } },
  });
  return {
    result: updated.count === 1 ? ("valid" as const) : ("used" as const),
    event: ticket.orderItem.ticketType.event.title,
    category: ticket.orderItem.ticketType.name,
    seat: ticket.seat,
    holder: ticket.orderItem.order.holderName,
    usedAt: ticket.usedAt,
  };
}
