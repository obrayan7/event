import type { MetadataRoute } from "next";
import { prisma } from "@rideau/db";
import { siteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await prisma.event.findMany({ where: { status: "PUBLISHED", startsAt: { gte: new Date() } }, select: { slug: true, updatedAt: true } });
  return [
    { url: siteUrl(), changeFrequency: "daily", priority: 1 },
    ...events.map((e) => ({ url: `${siteUrl()}/evenements/${e.slug}`, lastModified: e.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...["mentions-legales", "cgv", "confidentialite", "cookies"].map((p) => ({ url: `${siteUrl()}/${p}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
