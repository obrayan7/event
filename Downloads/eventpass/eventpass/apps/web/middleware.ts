import { NextResponse, type NextRequest } from "next/server";

/**
 * Serveur « API » (ex. hébergé sur Render à l'adresse api.monentreprise.fr) : il ne doit servir que les routes /api/*
 * (webhooks de paiement, confirmation des virements, tâche d'expiration…). Toute autre adresse reçue sur un nom de domaine
 * commençant par « api. » est renvoyée vers le site public (même adresse sans « api. »). Sans effet partout ailleurs.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (!host.startsWith("api.")) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  return NextResponse.redirect(`https://${host.slice(4)}${pathname}${search}`, 307);
}

export const config = { matcher: ["/((?!api/|_next/|favicon.ico).*)"] };
