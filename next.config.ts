import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mora-sdk ships TypeScript source from the workspace (PRD §13).
  transpilePackages: ["mora-sdk"],
  poweredByHeader: false,
  // The screens moved into the app. Query strings pass through, so shared
  // receipt links and the simulator's prefilled links keep working.
  async redirects() {
    return [
      { source: "/exit", destination: "/app/carry", permanent: false },
      { source: "/try", destination: "/app", permanent: false },
      { source: "/recover", destination: "/app/receipts", permanent: false },
      { source: "/receipt", destination: "/app/receipts", permanent: false },
      { source: "/exchange", destination: "/app/exchange", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
