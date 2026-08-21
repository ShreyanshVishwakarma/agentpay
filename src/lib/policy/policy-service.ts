import { db } from "@/lib/db";
import { recordAuditEvent, verifyGlobalChain } from "@/lib/audit/audit-service";
import {
  DEFAULT_POLICY_VALUES,
  getPolicyConfig,
  type PolicyValues,
} from "@/lib/checkout/policy-engine";
import type { MerchantPolicyUpdate, CatalogAccessUpdate } from "@/schemas/merchant";

export const MERCHANT_ACTOR = "Merchant Demo Admin";

/**
 * Save a new immutable policy version. Historical checkouts keep the policy
 * version they were evaluated against — nothing is re-evaluated.
 */
export async function updateMerchantPolicy(
  input: MerchantPolicyUpdate,
): Promise<{ policyVersion: number; changedFields: string[] }> {
  const current = await getPolicyConfig();
  const { changeNote: _changeNote, ...fields } = input;

  const nextVersionNumber = await db.$transaction(async (tx) => {
    const latest = await tx.merchantPolicy.findFirst({
      orderBy: { policyVersion: "desc" },
      select: { policyVersion: true },
    });
    const nextVersion = (latest?.policyVersion ?? 0) + 1;

    // Supersede the previous version row (if it came from this table).
    if (latest) {
      await tx.merchantPolicy.updateMany({
        where: { supersededAt: null, policyVersion: { not: nextVersion } },
        data: { supersededAt: new Date() },
      });
    }

    await tx.merchantPolicy.create({
      data: {
        policyVersion: nextVersion,
        merchantName: fields.merchantName ?? current.merchantName,
        maxOrderPaise: fields.maxOrderPaise ?? current.maxOrderPaise,
        maxQuantityPerItem: fields.maxQuantityPerItem ?? current.maxQuantityPerItem,
        maxItemsPerOrder: fields.maxItemsPerOrder ?? current.maxItemsPerOrder,
        confirmationRequired: fields.confirmationRequired ?? current.confirmationRequired,
        allowedCurrency: fields.allowedCurrency ?? current.allowedCurrency,
        sessionExpiryMinutes: fields.sessionExpiryMinutes ?? current.sessionExpiryMinutes,
        defaultBuyerBudgetPaise:
          fields.defaultBuyerBudgetPaise !== undefined
            ? fields.defaultBuyerBudgetPaise
            : current.defaultBuyerBudgetPaise,
        maxAgentProposedCartPaise:
          fields.maxAgentProposedCartPaise ?? current.maxAgentProposedCartPaise,
        extraConfirmationThresholdPaise:
          fields.extraConfirmationThresholdPaise ?? current.extraConfirmationThresholdPaise,
        dailyTestModeCapPaise: fields.dailyTestModeCapPaise ?? current.dailyTestModeCapPaise,
        agentCanRecommend: fields.agentCanRecommend ?? current.agentCanRecommend,
        agentCanPrepareCheckout:
          fields.agentCanPrepareCheckout ?? current.agentCanPrepareCheckout,
        agentCanApplyBundleDiscount:
          fields.agentCanApplyBundleDiscount ?? current.agentCanApplyBundleDiscount,
        maxAttemptsPerSession: fields.maxAttemptsPerSession ?? current.maxAttemptsPerSession,
        maxCheckoutsPerCartHash:
          fields.maxCheckoutsPerCartHash ?? current.maxCheckoutsPerCartHash,
        coolingOffMinutesAfterFailures:
          fields.coolingOffMinutesAfterFailures ?? current.coolingOffMinutesAfterFailures,
        lowStockReviewThreshold:
          fields.lowStockReviewThreshold ?? current.lowStockReviewThreshold,
        recoveryEnabled: fields.recoveryEnabled ?? current.recoveryEnabled,
        maxRecoveryAttempts: fields.maxRecoveryAttempts ?? current.maxRecoveryAttempts,
        changedBy: MERCHANT_ACTOR,
        changeNote: _changeNote ?? null,
      },
    });

    return nextVersion;
  });

  const changedFields = Object.keys(fields);
  const oldValue = extractValues(current, changedFields);
  const newValue = extractValues({ ...current, ...fields } as PolicyValues, changedFields);

  await recordAuditEvent({
    eventType: "POLICY_CHANGED",
    actor: "MERCHANT",
    payload: {
      policyVersion: nextVersionNumber,
      previousPolicyVersion: current.policyVersion,
      changedBy: MERCHANT_ACTOR,
      changeNote: _changeNote ?? null,
      oldValues: oldValue,
      newValues: newValue,
    },
  });

  return { policyVersion: nextVersionNumber, changedFields };
}

function extractValues(policy: PolicyValues, fields: string[]): Record<string, unknown> {
  const record = policy as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in record) out[field] = record[field];
  }
  return out;
}

/** Update AI access flags for one catalog product. */
export async function updateCatalogAccess(
  input: CatalogAccessUpdate,
): Promise<{ sku: string; changedFields: string[] }> {
  const item = await db.catalogItem.findUnique({ where: { sku: input.sku } });
  if (!item) {
    throw new Error(`Unknown SKU: ${input.sku}`);
  }

  const { sku, ...flags } = input;
  const changedEntries = Object.entries(flags).filter(
    ([, value]) => value !== undefined,
  );
  if (changedEntries.length === 0) {
    throw new Error("No catalog access changes supplied.");
  }

  await db.catalogItem.update({
    where: { sku },
    data: Object.fromEntries(changedEntries),
  });

  await recordAuditEvent({
    eventType: "POLICY_CHANGED",
    actor: "MERCHANT",
    payload: {
      control: "catalog_access",
      sku,
      changedBy: MERCHANT_ACTOR,
      oldValues: Object.fromEntries(
        changedEntries.map(([key]) => [
          key,
          (item as unknown as Record<string, unknown>)[key],
        ]),
      ),
      newValues: Object.fromEntries(changedEntries),
    },
  });

  return { sku, changedFields: changedEntries.map(([key]) => key) };
}

export async function listPolicyVersions() {
  return db.merchantPolicy.findMany({
    orderBy: { policyVersion: "desc" },
    take: 20,
  });
}

export { DEFAULT_POLICY_VALUES, verifyGlobalChain, getPolicyConfig };
