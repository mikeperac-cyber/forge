import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // No reason to advertise the framework in every response header.
  poweredByHeader: false,
  turbopack: {
    // Without this Turbopack walks up and finds the package-lock.json in the
    // home directory, then treats C:\Users\micha as the project root.
    root: path.resolve(import.meta.dirname),
  },
  // better-sqlite3 is a native addon; bundling it breaks the binding lookup.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
