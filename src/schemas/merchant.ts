import { z } from "zod";

/** Merchant AI-commerce policy — full versioned shape. */
export const merchantPolicyUpdateSchema = z
  .object({
    merchantName: z.string().min(1).max(80).optional(),
    maxOrderPaise: z.number().int().positive().max(100_000_000).optional(),
    maxQuantityPerItem: z.number().int().min(1).max(5).optional(),
    maxItemsPerOrder: z.number().int().min(1).max(20).optional(),
    confirmationRequired: z.boolean().optional(),
    allowedCurrency: z.enum(["INR"]).optional(),
    sessionExpiryMinutes: z.number().int().min(5).max(1440).optional(),
    defaultBuyerBudgetPaise: z.number().int().positive().max(10_000_000).nullable().optional(),
    maxAgentProposedCartPaise: z.number().int().positive().max(100_000_000).optional(),
    extraConfirmationThresholdPaise: z.number().int().positive().max(100_000_000).optional(),
    dailyTestModeCapPaise: z.number().int().positive().max(100_000_000).optional(),
    agentCanRecommend: z.boolean().optional(),
    agentCanPrepareCheckout: z.boolean().optional(),
    agentCanApplyBundleDiscount: z.boolean().optional(),
    maxAttemptsPerSession: z.number().int().min(1).max(10).optional(),
    maxCheckoutsPerCartHash: z.number().int().min(1).max(50).optional(),
    coolingOffMinutesAfterFailures: z.number().int().min(0).max(10080).optional(),
    lowStockReviewThreshold: z.number().int().min(0).max(1000).optional(),
    recoveryEnabled: z.boolean().optional(),
    maxRecoveryAttempts: z.number().int().min(1).max(5).optional(),
    changeNote: z.string().max(280).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one policy field must be provided.",
  });

export type MerchantPolicyUpdate = z.infer<typeof merchantPolicyUpdateSchema>;

export const catalogAccessUpdateSchema = z.object({
  sku: z.string().min(1),
  agentDiscoverable: z.boolean().optional(),
  agentPurchasable: z.boolean().optional(),
  paused: z.boolean().optional(),
  maxAgentQuantity: z.number().int().min(1).max(5).nullable().optional(),
});

export type CatalogAccessUpdate = z.infer<typeof catalogAccessUpdateSchema>;

export const policySimulationRequestSchema = z.object({
  scenarioKey: z.string().min(1).max(60),
});

export type PolicySimulationRequest = z.infer<typeof policySimulationRequestSchema>;
