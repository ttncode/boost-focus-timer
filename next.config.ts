import type { NextConfig } from "next";
import packageJson from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  env: { NEXT_PUBLIC_APP_VERSION: packageJson.version },
};

export default nextConfig;
