import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / CJS modules that must not be bundled by Turbopack.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
