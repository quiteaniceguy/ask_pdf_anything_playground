import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  turbopack: {
    resolveAlias: {
      "@mediapipe/selfie_segmentation": "./lib/vendor/mediapipe-selfie-segmentation-shim.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias["@mediapipe/selfie_segmentation"] =
      "./lib/vendor/mediapipe-selfie-segmentation-shim.ts";
    return config;
  },
};

export default nextConfig;
