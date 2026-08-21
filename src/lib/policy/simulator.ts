import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import {
  evaluateCartAgainstPolicy,
  getCatalogSnapshot,
  getPolicyConfig,
} from "@/lib/checkout/policy-engine";
import type { PolicyResult } from "@/lib/checkout/policy-engine";

export interface SimulationScenario {
  key: string;
  label: string;
  description: string;
  intent: {
    items: Array<{ sku: string; quantity: number }>;
    maxBudgetPaise?: number;
    clarificationNeeded: false;
  };
}

/**
 * Seeded demo scenarios. Simulation is pure evaluation: it never creates
 * checkout sessions or Razorpay orders.
 */
export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    key: "two-sql-under-800",
    label: "Buy 2 SQL packs under ₹800",
    description: "Happy path — within budget and stock.",
    intent: {
      items: [{ sku: "sql-pro-pack", quantity: 2 }],
      maxBudgetPaise: 80000,
      clarificationNeeded: false,
    },
  },
  {
    key: "three-sql-under-800",
    label: "Buy 3 SQL packs under ₹800",
    description: "Cart value breaches the buyer budget.",
    intent: {
      items: [{ sku: "sql-pro-pack", quantity: 3 }],
      maxBudgetPaise: 80000,
      clarificationNeeded: false,
    },
  },
  {
    key: "sold-out-bundle",
    label: "Buy sold-out Premium Bundle",
    description: "Requested item has zero stock.",
    intent: {
      items: [{ sku: "sold-out-bundle", quantity: 1 }],
      clarificationNeeded: false,
    },
  },
  {
    key: "six-items",
    label: "Buy 6 items",
    description: "Cart exceeds the per-order item cap.",
    intent: {
      items: [
        { sku: "sql-pro-pack", quantity: 3 },
        { sku: "nextjs-backend-pack", quantity: 3 },
      ],
      clarificationNeeded: false,
    },
  },
  {
    key: "paused-product",
    label: "Checkout after product is paused",
    description: "Merchant paused the product for AI purchases.",
    intent: {
      items: [{ sku: "sql-pro-pack", quantity: 1 }],
      clarificationNeeded: false,
    },
  },
];

const scenarioKeySchema = z.enum([
  "two-sql-under-800",
  "three-sql-under-800",
  "sold-out-bundle",
  "six-items",
  "paused-product",
]);

export interface SimulationOutcome {
  scenarioKey: string;
  label: string;
  approved: boolean;
  rejectionCode: string | null;
  responsibleControl: string | null;
  explanation: string;
  suggestedAction: string | null;
}

/**
 * Run a seeded scenario against the CURRENT policy without creating any
 * checkout session or Razorpay order. Appends a POLICY_SIMULATION_RUN event
 * to the global merchant audit chain.
 */
export async function runPolicySimulation(
  scenarioKey: string,
): Promise<SimulationOutcome> {
  const parsed = scenarioKeySchema.safeParse(scenarioKey);
  if (!parsed.success) {
    throw new Error(`Unknown simulation scenario: ${scenarioKey}`);
  }
  const scenario = SIMULATION_SCENARIOS.find((s) => s.key === parsed.data)!;

  // The paused-product scenario pauses the product in-memory only — the
  // simulation must not mutate catalog state.
  const [policy, catalog] = await Promise.all([getPolicyConfig(), getCatalogSnapshot()]);
  const effectiveCatalog =
    scenario.key === "paused-product"
      ? catalog.map((item) =>
          item.sku === "sql-pro-pack" ? { ...item, paused: true } : item,
        )
      : catalog;

  let result: PolicyResult;
  try {
    result = evaluateCartAgainstPolicy(
      { ...scenario.intent, clarificationNeeded: false },
      { policy, catalog: effectiveCatalog, now: new Date(), verifiedRevenueTodayPaise: 0 },
    );
  } finally {
    await recordAuditEvent({
      eventType: "POLICY_SIMULATION_RUN",
      actor: "MERCHANT",
      payload: {
        scenarioKey: scenario.key,
        simulatedAgainstPolicyVersion: policy.policyVersion,
        note: "Simulation only — no checkout session or order was created.",
      },
    });
  }

  if (result.ok) {
    return {
      scenarioKey: scenario.key,
      label: scenario.label,
      approved: true,
      rejectionCode: null,
      responsibleControl: null,
      explanation: `Approved under policy v${policy.policyVersion}: ${formatTotal(result.totalPaise)} within all limits.`,
      suggestedAction: null,
    };
  }

  return {
    scenarioKey: scenario.key,
    label: scenario.label,
    approved: false,
    rejectionCode: result.code,
    responsibleControl:
      (result.details.control as string | undefined) ?? "core_policy_engine",
    explanation: result.message,
    suggestedAction: result.suggestedAction,
  };
}

function formatTotal(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}
