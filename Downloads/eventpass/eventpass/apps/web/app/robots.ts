import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/panier", "/paiement", "/commande/", "/compte", "/api/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
