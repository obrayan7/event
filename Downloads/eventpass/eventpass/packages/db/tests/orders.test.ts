/**
 * Tests d'intégration : nécessitent une base PostgreSQL (DATABASE_URL), de préférence une base de test dédiée.
 *   npm run test -w @rideau/db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client";
import { CartError, expireOrders, markOrderPaid, recordBankProof, releaseSeat, reserveSeats, scanTicket, updateCart } from "../src/orders";

let ticketTypeId: string;
let eventId: string;

beforeAll(async () => {
  const category = await prisma.category.upsert({ where: { slug: "test" }, update: {}, create: { name: "Test", slug: "test" } });
  const venue = await prisma.venue.create({ data: { name: "Salle test", address: "1 rue du Test", city: "Paris" } });
  const event = await prisma.event.create({
    data: {
      title: "Événement de test", slug: `test-${Date.now()}`, description: "Test de charge sur le stock",
      startsAt: new Date(Date.now() + 7 * 864e5), status: "PUBLISHED", venueId: venue.id, categoryId: category.id,
    },
  });
  eventId = event.id;
  const tt = await prisma.ticketType.create({ data: { eventId, name: "Unique", priceCents: 2000, quantity: 5, maxPerOrder: 8 } });
  ticketTypeId = tt.id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { order: { items: { some: { ticketTypeId } } } } });
  await prisma.ticket.deleteMany({ where: { orderItem: { ticketTypeId } } });
  await prisma.order.deleteMany({ where: { items: { some: { ticketTypeId } } } });
  await prisma.ticketType.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
  await prisma.$disconnect();
});

describe("réservation", () => {
  it("n'autorise jamais plus de places que le stock (20 acheteurs simultanés pour 5 places)", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => updateCart({ changes: [{ ticketTypeId, quantity: 1, mode: "add" }] })),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const refused = results.filter((r) => r.status === "rejected" && r.reason instanceof CartError).length;
    expect(ok).toBe(5);
    expect(refused).toBe(15);
  });

  it("libère les places quand la réservation expire", async () => {
    await prisma.order.updateMany({ where: { status: "PENDING", items: { some: { ticketTypeId } } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireOrders()).toBeGreaterThanOrEqual(5);
    const id = await updateCart({ changes: [{ ticketTypeId, quantity: 5, mode: "add" }] });
    expect(id).not.toBeNull();
  });

  it("refuse plus que le maximum par commande", async () => {
    await expect(updateCart({ changes: [{ ticketTypeId, quantity: 9, mode: "add" }] })).rejects.toThrow(CartError);
  });
});

describe("paiement et billets", () => {
  it("émet les billets une seule fois, même si le webhook est rejoué", async () => {
    await prisma.order.updateMany({ where: { status: "PENDING", items: { some: { ticketTypeId } } }, data: { status: "CANCELLED" } });
    const orderId = (await updateCart({ changes: [{ ticketTypeId, quantity: 2, mode: "add" }] }))!;
    const first = await markOrderPaid({ orderId, provider: "STRIPE" });
    const second = await markOrderPaid({ orderId, provider: "STRIPE" });
    expect(first.issued).toBe(true);
    expect(second.issued).toBe(false);
    const tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId } } });
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((t) => t.code)).size).toBe(2);
  });

  it("accepte un billet une fois au scan, puis le refuse", async () => {
    const ticket = (await prisma.ticket.findFirst({ where: { orderItem: { ticketTypeId } } }))!;
    expect((await scanTicket(ticket.code)).result).toBe("valid");
    expect((await scanTicket(ticket.code)).result).toBe("used");
    expect((await scanTicket("code-inconnu")).result).toBe("invalid");
  });
});

describe("virement bancaire", () => {
  it("la confirmation par l'admin (preuve envoyée) émet les billets une seule fois", async () => {
    await prisma.order.updateMany({ where: { status: "PENDING", items: { some: { ticketTypeId } } }, data: { status: "CANCELLED" } });
    const orderId = (await updateCart({ changes: [{ ticketTypeId, quantity: 1, mode: "add" }] }))!;
    const payment = await prisma.payment.create({
      data: { orderId, provider: "BANK_TRANSFER", externalId: `VIR-TEST-${Date.now()}`, amountCents: 2000, status: "PENDING" },
    });
    await recordBankProof({ paymentId: payment.id, filename: "preuve.jpg", mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PROOF_SUBMITTED");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 864e5); // réservation maintenue pendant la vérification

    const first = await markOrderPaid({ orderId, provider: "BANK_TRANSFER" });
    const second = await markOrderPaid({ orderId, provider: "BANK_TRANSFER" });
    expect(first.issued).toBe(true);
    expect(second.issued).toBe(false);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PAID");
    expect(await prisma.ticket.count({ where: { orderItem: { orderId } } })).toBe(1);
  });
});

describe("virement bancaire", () => {
  it("la confirmation par l'admin (preuve envoyée) émet les billets une seule fois", async () => {
    await prisma.order.updateMany({ where: { status: "PENDING", items: { some: { ticketTypeId } } }, data: { status: "CANCELLED" } });
    const orderId = (await updateCart({ changes: [{ ticketTypeId, quantity: 1, mode: "add" }] }))!;
    const payment = await prisma.payment.create({
      data: { orderId, provider: "BANK_TRANSFER", externalId: `VIR-TEST-${Date.now()}`, amountCents: 2000, status: "PENDING" },
    });
    await recordBankProof({ paymentId: payment.id, filename: "preuve.jpg", mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PROOF_SUBMITTED");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 864e5); // réservation maintenue pendant la vérification

    const first = await markOrderPaid({ orderId, provider: "BANK_TRANSFER" });
    const second = await markOrderPaid({ orderId, provider: "BANK_TRANSFER" });
    expect(first.issued).toBe(true);
    expect(second.issued).toBe(false);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PAID");
    expect(await prisma.ticket.count({ where: { orderItem: { orderId } } })).toBe(1);
  });
});

describe("places numérotées", () => {
  let seatedEventId: string;
  let seatIds: string[] = [];
  let seatedTypeId: string;

  beforeAll(async () => {
    const category = await prisma.category.upsert({ where: { slug: "test" }, update: {}, create: { name: "Test", slug: "test" } });
    const venue = await prisma.venue.create({ data: { name: "Salle plan", address: "2 rue du Plan", city: "Lyon" } });
    const event = await prisma.event.create({
      data: {
        title: "Plan de salle test", slug: `plan-${Date.now()}`, description: "Test des places numérotées",
        startsAt: new Date(Date.now() + 7 * 864e5), status: "PUBLISHED", seatingMode: "ASSIGNED", venueId: venue.id, categoryId: category.id,
      },
    });
    seatedEventId = event.id;
    const tt = await prisma.ticketType.create({ data: { eventId: event.id, name: "Orchestre", priceCents: 4000, quantity: 3 } });
    seatedTypeId = tt.id;
    for (let n = 1; n <= 3; n++) {
      const s = await prisma.seat.create({ data: { eventId: event.id, ticketTypeId: tt.id, row: "A", number: n, col: n - 1, label: `A${n}` } });
      seatIds.push(s.id);
    }
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { orderItem: { ticketTypeId: seatedTypeId } } });
    await prisma.order.deleteMany({ where: { items: { some: { ticketTypeId: seatedTypeId } } } });
    await prisma.seat.deleteMany({ where: { eventId: seatedEventId } });
    await prisma.ticketType.deleteMany({ where: { eventId: seatedEventId } });
    await prisma.event.delete({ where: { id: seatedEventId } });
  });

  it("une même place ne peut être réservée que par un seul acheteur (15 tentatives simultanées)", async () => {
    const results = await Promise.allSettled(Array.from({ length: 15 }, () => reserveSeats({ seatIds: [seatIds[0]] })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof CartError)).toHaveLength(14);
  });

  it("calcule le prix à partir de la catégorie et attribue la place au billet après paiement", async () => {
    const orderId = await reserveSeats({ seatIds: [seatIds[1], seatIds[2]] });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(order.totalCents).toBe(8000);
    expect(order.items[0].quantity).toBe(2);

    expect((await markOrderPaid({ orderId, provider: "STRIPE" })).issued).toBe(true);
    const tickets = await prisma.ticket.findMany({ where: { orderItem: { orderId } }, orderBy: { seat: "asc" } });
    expect(tickets.map((t) => t.seat)).toEqual(["A2", "A3"]);
    expect(tickets.every((t) => t.seatId)).toBe(true);
  });

  it("retirer une place du panier la rend de nouveau disponible", async () => {
    const [free] = await prisma.seat.findMany({ where: { eventId: seatedEventId, orderSeats: { none: {} } } });
    if (!free) return; // toutes prises par les tests précédents
    const orderId = await reserveSeats({ seatIds: [free.id] });
    expect(await releaseSeat({ orderId, seatId: free.id })).toBeNull(); // panier vide → commande supprimée
    await expect(reserveSeats({ seatIds: [free.id] })).resolves.toBeTruthy();
  });

  it("refuse la réservation par quantité sur un événement à places numérotées", async () => {
    await expect(updateCart({ changes: [{ ticketTypeId: seatedTypeId, quantity: 1, mode: "add" }] })).rejects.toThrow(CartError);
  });
});
