import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hashCart } from "../src/lib/checkout/cart-hash";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const catalogItems = [
  {
    sku: "sql-pro-pack",
    name: "SQL Pro Interview Pack",
    description:
      "75 advanced SQL interview challenges covering joins, CTEs, window functions, and query optimization.",
    pricePaise: 39900,
    stock: 10,
    active: true,
  },
  {
    sku: "nextjs-backend-pack",
    name: "Next.js Backend Pack",
    description:
      "Practical API routes, authentication, caching, database, and deployment interview preparation.",
    pricePaise: 49900,
    stock: 8,
    active: true,
  },
  {
    sku: "database-design-pack",
    name: "Database Design Pack",
    description:
      "Schema design exercises, indexing patterns, normalization, and trade-off case studies.",
    pricePaise: 29900,
    stock: 15,
    active: true,
  },
  {
    sku: "system-design-starter",
    name: "System Design Starter Kit",
    description:
      "Entry-level system design prompts, templates, and scalability fundamentals.",
    pricePaise: 59900,
    stock: 3,
    active: true,
  },
  {
    sku: "sold-out-bundle",
    name: "Premium Interview Bundle",
    description:
      "A deliberately unavailable item used to demonstrate out-of-stock protection.",
    pricePaise: 99900,
    stock: 0,
    active: true,
  },
];

async function main() {
  console.log("Seeding merchant policy + catalog…");

  await prisma.policyConfig.upsert({
    where: { id: "policy-default" },
    update: {
      merchantName: "SkillForge Learning",
      maxOrderPaise: 100000,
      maxItemsPerOrder: 5,
      confirmationRequired: true,
    },
    create: {
      id: "policy-default",
      merchantName: "SkillForge Learning",
      maxOrderPaise: 100000,
      maxItemsPerOrder: 5,
      confirmationRequired: true,
    },
  });

  for (const item of catalogItems) {
    await prisma.catalogItem.upsert({
      where: { sku: item.sku },
      update: item,
      create: item,
    });
  }

  // Sanity check the canonical cart hash utility works in this runtime.
  const sample = hashCart({ items: [{ sku: "sql-pro-pack", quantity: 2 }] });
  if (!/^[a-f0-9]{64}$/.test(sample)) {
    throw new Error("cart hash utility produced unexpected output");
  }

  console.log(`Seeded ${catalogItems.length} catalog items + policy config.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
