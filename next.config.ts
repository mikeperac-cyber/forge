import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // No reason to advertise the framework in every response header.
  poweredByHeader: false,
  turbopack: {
    // Without this Turbopack walks up and finds the package-lock.json in the
    // home directory, then treats C:\Users\micha as the project root.
    root: path.resolve(import.meta.dirname),
    resolveAlias: {
      // isolated-vm is a server-only native addon, but the shared node registry
      // pulls expr.ts into the client graph. Give the browser an empty stand-in;
      // the server still resolves the real package (browser condition only).
      "isolated-vm": { browser: "./lib/engine/isolated-vm.browser.ts" },
    },
  },
  // Native addons; bundling them breaks the binding lookup.
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "isolated-vm",
  ],
};

export default nextConfig;
