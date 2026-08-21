import path from "node:path";
process.env.DATABASE_URL = `file:${path.resolve("dev.db")}`;

async function main() {
  const { db } = await import("../src/lib/db");
  const { verifySessionChain, verifyGlobalChain } = await import("../src/lib/audit/audit-service");
  const { computeInsights } = await import("../src/lib/insights/metrics");

  const statuses = await db.checkoutSession.groupBy({ by: ["status"], _count: { _all: true } });
  console.log(
    "statuses:",
    statuses.map((s) => `${s.status}=${s._count._all}`).join(", "),
  );
  console.log("recovery cases:", await db.recoveryCase.count());
  console.log("webhook events:", await db.webhookEvent.count());

  const sessions = await db.checkoutSession.findMany({ select: { id: true }, take: 60 });
  let broken = 0;
  for (const session of sessions) {
    const result = await verifySessionChain(session.id);
    if (!result.valid) broken += 1;
  }
  console.log("broken session chains:", broken);
  console.log("global chain valid:", (await verifyGlobalChain()).valid);

  const insights = await computeInsights();
  console.log(
    JSON.stringify(
      {
        revenueVerifiedPaise: insights.revenueVerifiedPaise,
        revenueProtectedPaise: insights.revenueProtectedPaise,
        revenueAtRiskPaise: insights.revenueAtRiskPaise,
        funnelCounts: insights.funnel.map((f) => `${f.label}:${f.count}`),
        topBlocked: insights.topBlockedReasons,
        recoveryRate: insights.recoveryConversionRate,
      },
      null,
      1,
    ),
  );
  await db.$disconnect();
}
main();
