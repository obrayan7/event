import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const prod = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rideau/db"],
  poweredByHeader: false,
  // Image Docker autonome (BUILD_STANDALONE=1 est défini dans le Dockerfile)
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  experimental: {
    instrumentationHook: true,
    serverActions: { bodySizeLimit: "8mb" }, // preuves de virement (5 Mo maximum par fichier)
    outputFileTracingRoot: root,
    serverComponentsExternalPackages: ["@prisma/client", "sharp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
