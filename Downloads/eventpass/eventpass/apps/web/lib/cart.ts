import { cookies } from "next/headers";
import { prisma } from "@rideau/db";

const COOKIE = "cart";

/** Le panier est une commande PENDING non expirée, retrouvée grâce au jeton stocké dans un cookie. */
export async function getCart() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  return prisma.order.findFirst({
    where: { accessToken: token, status: "PENDING", expiresAt: { gt: new Date() } },
    include: {
      seats: { include: { seat: true } },
      items: {
        orderBy: { id: "asc" },
        include: { ticketType: { include: { event: { include: { venue: true } } } } },
      },
    },
  });
}

export type Cart = NonNullable<Awaited<ReturnType<typeof getCart>>>;

export function setCartCookie(token: string) {
  cookies().set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 });
}

export function clearCartCookie() {
  cookies().delete(COOKIE);
}
