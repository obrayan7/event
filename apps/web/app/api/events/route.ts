import { NextResponse } from "next/server";
import { listEvents } from "@rideau/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const maxPrice = p.get("prix");
  const result = await listEvents({
    q: p.get("q") ?? undefined,
    city: p.get("ville") ?? undefined,
    category: p.get("categorie") ?? undefined,
    from: p.get("du") ?? undefined,
    to: p.get("au") ?? undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    sort: p.get("tri") === "prix" ? "prix" : "date",
    page: Number(p.get("page") ?? 1) || 1,
  });
  return NextResponse.json({
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    events: result.events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt,
      venue: { name: e.venue.name, city: e.venue.city },
      category: e.category.name,
      cover: e.images[0]?.url ?? null,
      fromPriceCents: e.fromPriceCents,
    })),
  });
}
