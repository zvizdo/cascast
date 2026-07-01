import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Next 16: top-level (was experimental.serverComponentsExternalPackages)
  serverExternalPackages: ["firebase-admin", "@google-cloud/pubsub", "@google-cloud/storage"],
};
export default nextConfig;
