"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CartError, cancelOrder, expireOrders, prisma, releaseSeat, reserveSeats, updateCart } from "@rideau/db";
import { clearCartCookie, getCart, setCartCookie } from "@/lib/cart";
import { getCustomer } from "@/lib/customer-auth";

const back = (path: string, error: string): never => redirect(`${path}?error=${encodeURIComponent(error)}`);

/** Formulaire de la page événement : champs qty_<ticketTypeId>. */
export async function addToCart(slug: string, formData: FormData) {
  const changes = [...formData.entries()]
    .filter(([k]) => k.startsWith("qty_"))
    .map(([k, v]) => ({ ticketTypeId: k.slice(4), quantity: parseInt(String(v), 10) || 0, mode: "add" as const }))
    .filter((c) => c.quantity > 0);
  if (changes.length === 0) back(`/evenements/${slug}`, "Choisissez au moins un billet.");

  const [customer, cart] = await Promise.all([getCustomer(), getCart()]);
  let orderId: string | null = null;
  try {
    orderId = await updateCart({ orderId: cart?.id, changes, userId: customer?.id });
  } catch (e) {
    if (e instanceof CartError) back(`/evenements/${slug}`, e.message);
    throw e;
  }
  if (!orderId) back(`/evenements/${slug}`, "Impossible de réserver ces billets.");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId! }, select: { accessToken: true } });
  setCartCookie(order.accessToken);
  void expireOrders().catch(() => {});
  redirect("/panier");
}

async function change(ticketTypeId: string, quantity: number) {
  const cart = await getCart();
  if (!cart) redirect("/panier");
  let orderId: string | null = null;
  try {
    orderId = await updateCart({ orderId: cart!.id, changes: [{ ticketTypeId, quantity, mode: "set" }] });
  } catch (e) {
    if (e instanceof CartError) back("/panier", e.message);
    throw e;
  }
  if (!orderId) clearCartCookie();
  revalidatePath("/panier");
  redirect("/panier");
}

export async function setQuantity(ticketTypeId: string, formData: FormData) {
  await change(ticketTypeId, parseInt(String(formData.get("quantity")), 10) || 0);
}

export async function removeFromCart(ticketTypeId: string) {
  await change(ticketTypeId, 0);
}

export async function emptyCart() {
  const cart = await getCart();
  if (cart) await cancelOrder(cart.id);
  clearCartCookie();
  redirect("/panier");
}

/** Plan de salle : places choisies (champs « seat »). */
export async function addSeatsToCart(slug: string, formData: FormData) {
  const seatIds = formData.getAll("seat").map(String).filter(Boolean);
  if (seatIds.length === 0) back(`/evenements/${slug}`, "Choisissez au moins une place sur le plan.");
  const [customer, cart] = await Promise.all([getCustomer(), getCart()]);
  let orderId: string | null = null;
  try {
    orderId = await reserveSeats({ orderId: cart?.id, seatIds, userId: customer?.id });
  } catch (e) {
    if (e instanceof CartError) back(`/evenements/${slug}`, e.message);
    throw e;
  }
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId! }, select: { accessToken: true } });
  setCartCookie(order.accessToken);
  void expireOrders().catch(() => {});
  redirect("/panier");
}

export async function removeSeat(seatId: string) {
  const cart = await getCart();
  if (!cart) redirect("/panier");
  const orderId = await releaseSeat({ orderId: cart!.id, seatId });
  if (!orderId) clearCartCookie();
  revalidatePath("/panier");
  redirect("/panier");
}
