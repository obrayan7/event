import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@rideau/db";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

function secret() {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("CUSTOMER_SESSION_SECRET manquant ou trop court (16 caractères minimum).");
  return new TextEncoder().encode(s);
}

export async function createCustomerSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
  cookies().set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export function destroyCustomerSession() {
  cookies().delete(COOKIE);
}

/** Utilisateur connecté, ou null. Ne redirige pas. */
export async function getCustomer() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true } });
  } catch {
    return null;
  }
}

export async function requireCustomer() {
  const user = await getCustomer();
  if (!user) redirect("/compte/connexion");
  return user;
}
