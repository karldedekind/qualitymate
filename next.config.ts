import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // pdfkit + fontkit load .afm/.ttf data files via fs at runtime relative to
  // their package dir. Webpack bundling rewrites __dirname to a /ROOT
  // placeholder and ENOENTs in the standalone build. Keep them external so
  // node resolves them from node_modules normally.
  serverExternalPackages: ["pdfkit", "fontkit"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default config;
