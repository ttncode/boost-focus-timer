import type { NextConfig } from "next";
import packageJson from "./package.json" with { type: "json" };

const isExtensionBuild = process.env.BUILD_TARGET === "extension";

const nextConfig: NextConfig = {
  // The extension is a static bundle; the web app ships as a standalone server.
  output: isExtensionBuild ? "export" : "standalone",
  devIndicators: false,
  images: { unoptimized: isExtensionBuild },
  env: { NEXT_PUBLIC_APP_VERSION: packageJson.version },
};

export default nextConfig;
