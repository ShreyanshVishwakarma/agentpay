import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Creates a pristine SQLite database for the test run by applying Prisma
 * migrations to prisma/test.db. Runs once before the vitest workers start.
 */
export default function globalSetup(): void {
  const testDb = path.resolve(__dirname, "..", "prisma", "test.db");
  for (const suffix of ["", "-journal"]) {
    const file = `${testDb}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: `file:${testDb}`,
    },
  });
}
