import { db } from "@/lib/db";

export const TEST_POLICY = {
  merchantName: "SkillForge Learning",
  maxOrderPaise: 100000,
  maxItemsPerOrder: 5,
  confirmationRequired: true,
};

export const TEST_CATALOG = [
  { sku: "sql-pro-pack", pricePaise: 39900, stock: 10, active: true },
  { sku: "nextjs-backend-pack", pricePaise: 49900, stock: 8, active: true },
  { sku: "database-design-pack", pricePaise: 29900, stock: 15, active: true },
  { sku: "system-design-starter", pricePaise: 59900, stock: 3, active: true },
  { sku: "sold-out-bundle", pricePaise: 99900, stock: 0, active: true },
] as const;

/** Idempotently seed the policy row and catalog used by integration tests. */
export async function seedTestData(): Promise<void> {
  await db.policyConfig.upsert({
    where: { id: "policy-default" },
    update: TEST_POLICY,
    create: { id: "policy-default", ...TEST_POLICY },
  });

  for (const item of TEST_CATALOG) {
    await db.catalogItem.upsert({
      where: { sku: item.sku },
      update: {
        pricePaise: item.pricePaise,
        stock: item.stock,
        active: item.active,
        name: `Test ${item.sku}`,
        description: "Integration test item",
      },
      create: {
        sku: item.sku,
        name: `Test ${item.sku}`,
        description: "Integration test item",
        pricePaise: item.pricePaise,
        stock: item.stock,
        active: item.active,
      },
    });
  }

  await db.catalogItem.upsert({
    where: { sku: "inactive-item" },
    update: { active: false, stock: 5 },
    create: {
      sku: "inactive-item",
      name: "Inactive Test Item",
      description: "Deliberately inactive",
      pricePaise: 10000,
      stock: 5,
      active: false,
    },
  });
}

/** Restore seeded stock levels so tests never depend on execution order. */
export async function resetStock(): Promise<void> {
  for (const item of TEST_CATALOG) {
    await db.catalogItem.update({ where: { sku: item.sku }, data: { stock: item.stock } });
  }
}

/** Wipe ephemeral checkout state between scenarios. */
export async function clearSessions(): Promise<void> {
  await db.auditEvent.deleteMany();
  await db.checkoutItem.deleteMany();
  await db.checkoutSession.deleteMany();
  await db.webhookEvent.deleteMany();
}
