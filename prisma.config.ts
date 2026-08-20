import { defineConfig } from "prisma/config";

// Prisma CLI does not auto-load .env in v7 — load it explicitly so
// `prisma migrate` / `prisma db seed` pick up DATABASE_URL.
try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional; fall back to process env / defaults.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
