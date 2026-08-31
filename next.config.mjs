import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const appUrl = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained `.next/standalone` server bundle (minimal
  // node_modules subset) — required for the lean multi-stage Docker image.
  output: "standalone",
  turbopack: {
    root: resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: appUrl.protocol.replace(":", ""),
        hostname: appUrl.hostname,
        port: appUrl.port,
        pathname: "/api/uploads/files/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/app/:workspace/settings",
        destination: "/app/:workspace/settings/profile",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
