import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
  compress: true,
  // Pas de source maps navigateur en production (valeur par défaut, rendue explicite).
  productionBrowserSourceMaps: false,
  images: {
    // Plus d'optimiseur Vercel (quota épuisé) : chaque image est servie par son
    // CDN, redimensionnée par ESPN quand elle vient de chez lui. Les origines
    // autorisées sont listées dans lib/image-hosts.ts (reprises par la CSP).
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Les pages HTML reçoivent leur CSP (avec nonce) depuis le middleware.
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
