import { NextResponse } from "next/server";
import { expireOrders } from "@rideau/db";

export const dynamic = "force-dynamic";

/** Tâche planifiée (toutes les 5 min) : Authorization: Bearer <CRON_SECRET>. Vercel Cron l'ajoute automatiquement. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json({ expired: await expireOrders() });
}
