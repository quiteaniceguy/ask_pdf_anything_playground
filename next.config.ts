import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
