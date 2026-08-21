-- CreateTable
CREATE TABLE "MerchantPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyVersion" INTEGER NOT NULL,
    "merchantName" TEXT NOT NULL,
    "maxOrderPaise" INTEGER NOT NULL,
    "maxQuantityPerItem" INTEGER NOT NULL DEFAULT 5,
    "maxItemsPerOrder" INTEGER NOT NULL,
    "confirmationRequired" BOOLEAN NOT NULL DEFAULT true,
    "allowedCurrency" TEXT NOT NULL DEFAULT 'INR',
    "sessionExpiryMinutes" INTEGER NOT NULL DEFAULT 30,
    "defaultBuyerBudgetPaise" INTEGER,
    "maxAgentProposedCartPaise" INTEGER NOT NULL DEFAULT 200000,
    "extraConfirmationThresholdPaise" INTEGER NOT NULL DEFAULT 75000,
    "dailyTestModeCapPaise" INTEGER NOT NULL DEFAULT 500000,
    "agentCanRecommend" BOOLEAN NOT NULL DEFAULT true,
    "agentCanPrepareCheckout" BOOLEAN NOT NULL DEFAULT true,
    "agentCanApplyBundleDiscount" BOOLEAN NOT NULL DEFAULT false,
    "maxAttemptsPerSession" INTEGER NOT NULL DEFAULT 3,
    "maxCheckoutsPerCartHash" INTEGER NOT NULL DEFAULT 5,
    "coolingOffMinutesAfterFailures" INTEGER NOT NULL DEFAULT 10,
    "lowStockReviewThreshold" INTEGER NOT NULL DEFAULT 2,
    "recoveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRecoveryAttempts" INTEGER NOT NULL DEFAULT 2,
    "changedBy" TEXT NOT NULL DEFAULT 'Merchant Demo Admin',
    "changeNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" DATETIME
);

-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkoutSessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ELIGIBLE',
    "interventionType" TEXT NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "expectedRecoveryValuePaise" INTEGER NOT NULL,
    "actualRecoveredValuePaise" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextEligibleAt" DATETIME,
    "stoppedReason" TEXT,
    "policyVersion" INTEGER NOT NULL,
    "replacementSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecoveryCase_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "messagePreview" TEXT NOT NULL,
    "copyMode" TEXT NOT NULL DEFAULT 'template',
    "copyVersion" TEXT NOT NULL DEFAULT 'v1',
    "approvedBy" TEXT NOT NULL,
    "executedAt" DATETIME,
    "result" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryAction_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previousHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CheckoutSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AuditEvent" ("actor", "createdAt", "eventHash", "eventType", "id", "payload", "previousHash", "sessionId") SELECT "actor", "createdAt", "eventHash", "eventType", "id", "payload", "previousHash", "sessionId" FROM "AuditEvent";
DROP TABLE "AuditEvent";
ALTER TABLE "new_AuditEvent" RENAME TO "AuditEvent";
CREATE INDEX "AuditEvent_sessionId_idx" ON "AuditEvent"("sessionId");
CREATE INDEX "AuditEvent_sessionId_createdAt_idx" ON "AuditEvent"("sessionId", "createdAt");
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");
CREATE TABLE "new_CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "stock" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "agentDiscoverable" BOOLEAN NOT NULL DEFAULT true,
    "agentPurchasable" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "maxAgentQuantity" INTEGER,
    "availableFrom" DATETIME,
    "availableUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CatalogItem" ("active", "createdAt", "currency", "description", "id", "imageUrl", "name", "pricePaise", "sku", "stock", "updatedAt") SELECT "active", "createdAt", "currency", "description", "id", "imageUrl", "name", "pricePaise", "sku", "stock", "updatedAt" FROM "CatalogItem";
DROP TABLE "CatalogItem";
ALTER TABLE "new_CatalogItem" RENAME TO "CatalogItem";
CREATE UNIQUE INDEX "CatalogItem_sku_key" ON "CatalogItem"("sku");
CREATE INDEX "CatalogItem_active_idx" ON "CatalogItem"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPolicy_policyVersion_key" ON "MerchantPolicy"("policyVersion");

-- CreateIndex
CREATE INDEX "MerchantPolicy_createdAt_idx" ON "MerchantPolicy"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCase_checkoutSessionId_key" ON "RecoveryCase"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "RecoveryCase_status_idx" ON "RecoveryCase"("status");

-- CreateIndex
CREATE INDEX "RecoveryCase_nextEligibleAt_idx" ON "RecoveryCase"("nextEligibleAt");

-- CreateIndex
CREATE INDEX "RecoveryCase_createdAt_idx" ON "RecoveryCase"("createdAt");

-- CreateIndex
CREATE INDEX "RecoveryAction_recoveryCaseId_idx" ON "RecoveryAction"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "CheckoutSession_createdAt_idx" ON "CheckoutSession"("createdAt");
