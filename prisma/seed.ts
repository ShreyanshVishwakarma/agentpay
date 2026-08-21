import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resetDemoData } from "../src/lib/demo/demo-seed";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding AgentPay Commerce Control Plane demo data…");
  const result = await resetDemoData();
  console.log(
    `Seeded policy v1+v2, catalog, ${result.sessions} synthetic checkout sessions, recovery cases and webhook evidence.`,
  );
  console.log("All seeded history is explicitly synthetic (Razorpay Test Mode; no real money).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
