"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ShieldAlert, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PolicyValues } from "@/lib/checkout/policy-engine";

interface DraftState {
  maxOrderRupees: string;
  maxQuantityPerItem: number;
  maxItemsPerOrder: number;
  confirmationRequired: boolean;
  sessionExpiryMinutes: number;
  defaultBuyerBudgetRupees: string;
  maxAgentProposedCartRupees: string;
  extraConfirmationThresholdRupees: string;
  dailyTestModeCapRupees: string;
  agentCanRecommend: boolean;
  agentCanPrepareCheckout: boolean;
  agentCanApplyBundleDiscount: boolean;
  recoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  coolingOffMinutesAfterFailures: number;
  lowStockReviewThreshold: number;
}

function toDraft(policy: PolicyValues): DraftState {
  return {
    maxOrderRupees: (policy.maxOrderPaise / 100).toString(),
    maxQuantityPerItem: policy.maxQuantityPerItem,
    maxItemsPerOrder: policy.maxItemsPerOrder,
    confirmationRequired: policy.confirmationRequired,
    sessionExpiryMinutes: policy.sessionExpiryMinutes,
    defaultBuyerBudgetRupees:
      policy.defaultBuyerBudgetPaise !== null
        ? (policy.defaultBuyerBudgetPaise / 100).toString()
        : "",
    maxAgentProposedCartRupees: (policy.maxAgentProposedCartPaise / 100).toString(),
    extraConfirmationThresholdRupees: (
      policy.extraConfirmationThresholdPaise / 100
    ).toString(),
    dailyTestModeCapRupees: (policy.dailyTestModeCapPaise / 100).toString(),
    agentCanRecommend: policy.agentCanRecommend,
    agentCanPrepareCheckout: policy.agentCanPrepareCheckout,
    agentCanApplyBundleDiscount: policy.agentCanApplyBundleDiscount,
    recoveryEnabled: policy.recoveryEnabled,
    maxRecoveryAttempts: policy.maxRecoveryAttempts,
    coolingOffMinutesAfterFailures: policy.coolingOffMinutesAfterFailures,
    lowStockReviewThreshold: policy.lowStockReviewThreshold,
  };
}

function rupeesToPaiseInput(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 100);
}

export function PolicyStudio({ policy }: { policy: PolicyValues }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState>(() => toDraft(policy));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);

    const payload: Record<string, unknown> = {};
    const maxOrder = rupeesToPaiseInput(draft.maxOrderRupees);
    if (maxOrder !== undefined && maxOrder !== policy.maxOrderPaise) payload.maxOrderPaise = maxOrder;
    if (draft.maxQuantityPerItem !== policy.maxQuantityPerItem) payload.maxQuantityPerItem = draft.maxQuantityPerItem;
    if (draft.maxItemsPerOrder !== policy.maxItemsPerOrder) payload.maxItemsPerOrder = draft.maxItemsPerOrder;
    if (draft.confirmationRequired !== policy.confirmationRequired) payload.confirmationRequired = draft.confirmationRequired;
    if (draft.sessionExpiryMinutes !== policy.sessionExpiryMinutes) payload.sessionExpiryMinutes = draft.sessionExpiryMinutes;

    const budget = rupeesToPaiseInput(draft.defaultBuyerBudgetRupees);
    const budgetChanged =
      (policy.defaultBuyerBudgetPaise === null && draft.defaultBuyerBudgetRupees !== "") ||
      (policy.defaultBuyerBudgetPaise !== null &&
        budget !== undefined &&
        budget !== policy.defaultBuyerBudgetPaise);
    if (budgetChanged) payload.defaultBuyerBudgetPaise = budget ?? null;

    const agentCart = rupeesToPaiseInput(draft.maxAgentProposedCartRupees);
    if (agentCart !== undefined && agentCart !== policy.maxAgentProposedCartPaise) payload.maxAgentProposedCartPaise = agentCart;
    const threshold = rupeesToPaiseInput(draft.extraConfirmationThresholdRupees);
    if (threshold !== undefined && threshold !== policy.extraConfirmationThresholdPaise) payload.extraConfirmationThresholdPaise = threshold;
    const dailyCap = rupeesToPaiseInput(draft.dailyTestModeCapRupees);
    if (dailyCap !== undefined && dailyCap !== policy.dailyTestModeCapPaise) payload.dailyTestModeCapPaise = dailyCap;

    if (draft.agentCanRecommend !== policy.agentCanRecommend) payload.agentCanRecommend = draft.agentCanRecommend;
    if (draft.agentCanPrepareCheckout !== policy.agentCanPrepareCheckout) payload.agentCanPrepareCheckout = draft.agentCanPrepareCheckout;
    if (draft.agentCanApplyBundleDiscount !== policy.agentCanApplyBundleDiscount) payload.agentCanApplyBundleDiscount = draft.agentCanApplyBundleDiscount;
    if (draft.recoveryEnabled !== policy.recoveryEnabled) payload.recoveryEnabled = draft.recoveryEnabled;
    if (draft.maxRecoveryAttempts !== policy.maxRecoveryAttempts) payload.maxRecoveryAttempts = draft.maxRecoveryAttempts;
    if (draft.coolingOffMinutesAfterFailures !== policy.coolingOffMinutesAfterFailures) payload.coolingOffMinutesAfterFailures = draft.coolingOffMinutesAfterFailures;
    if (draft.lowStockReviewThreshold !== policy.lowStockReviewThreshold) payload.lowStockReviewThreshold = draft.lowStockReviewThreshold;

    if (Object.keys(payload).length === 0) {
      setMessage("No changes to save.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/merchant/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        policyVersion?: number;
        error?: { message: string };
      };
      if (!response.ok) {
        setError(data.error?.message ?? "Could not save policy.");
      } else {
        setMessage(`Saved as policy v${data.policyVersion}. A POLICY_CHANGED event was recorded.`);
        router.refresh();
      }
    } catch {
      setError("Network error while saving policy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Transaction controls</CardTitle>
              <CardDescription>
                Hard limits enforced on every preview and confirmation.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
              Current: v{policy.policyVersion}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="max-order"
            label="Maximum order value (₹)"
            value={draft.maxOrderRupees}
            onChange={(value) => set("maxOrderRupees", value)}
          />
          <NumberField
            id="expiry"
            label="Checkout session expiry (minutes)"
                            value={draft.sessionExpiryMinutes.toString()}
            onChange={(value) => set("sessionExpiryMinutes", Number.parseInt(value, 10) || 0)}
            isInteger
          />
          <NumberField
            id="max-qty"
            label="Max quantity per item"
            value={draft.maxQuantityPerItem.toString()}
            onChange={(value) => set("maxQuantityPerItem", Number.parseInt(value, 10) || 1)}
            isInteger
          />
          <NumberField
            id="max-items"
            label="Max items per cart"
            value={draft.maxItemsPerOrder.toString()}
            onChange={(value) => set("maxItemsPerOrder", Number.parseInt(value, 10) || 1)}
            isInteger
          />
          <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5 sm:col-span-2">
            <div>
              <Label htmlFor="confirm-required" className="text-sm">Explicit confirmation required</Label>
              <p className="text-xs text-muted-foreground">
                Always recommended. Disabling removes the human gate.
              </p>
            </div>
            <Switch
              id="confirm-required"
              checked={draft.confirmationRequired}
              onCheckedChange={(checked) => set("confirmationRequired", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Budget controls</CardTitle>
          <CardDescription>Bounds on what an AI buyer can propose.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="default-budget"
            label="Default buyer budget (₹, blank = none)"
            value={draft.defaultBuyerBudgetRupees}
            onChange={(value) => set("defaultBuyerBudgetRupees", value)}
          />
          <NumberField
            id="agent-cart-cap"
            label="Max agent-proposed cart value (₹)"
            value={draft.maxAgentProposedCartRupees}
            onChange={(value) => set("maxAgentProposedCartRupees", value)}
          />
          <NumberField
            id="extra-confirm"
            label="Extra confirmation warning threshold (₹)"
            value={draft.extraConfirmationThresholdRupees}
            onChange={(value) => set("extraConfirmationThresholdRupees", value)}
          />
          <NumberField
            id="daily-cap"
            label="Daily test-mode transaction cap (₹)"
            value={draft.dailyTestModeCapRupees}
            onChange={(value) => set("dailyTestModeCapRupees", value)}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Agent authority controls</CardTitle>
          <CardDescription>What AI agents are allowed to do on this store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            id="can-recommend"
            label="Agent can recommend products"
            checked={draft.agentCanRecommend}
            onCheckedChange={(checked) => set("agentCanRecommend", checked)}
          />
          <ToggleRow
            id="can-prepare"
            label="Agent can prepare checkout"
            checked={draft.agentCanPrepareCheckout}
            onCheckedChange={(checked) => set("agentCanPrepareCheckout", checked)}
          />
          <ToggleRow
            id="can-discount"
            label="Agent can apply merchant-defined bundle discount"
            checked={draft.agentCanApplyBundleDiscount}
            onCheckedChange={(checked) => set("agentCanApplyBundleDiscount", checked)}
          />
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Agent can execute payment automatically — always disabled
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                Autonomous payment execution is intentionally disabled. Buyer
                confirmation is always required.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Risk &amp; recovery controls</CardTitle>
          <CardDescription>Stopping rules and review thresholds.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="low-stock"
            label="Flag product for review below stock"
            value={draft.lowStockReviewThreshold.toString()}
            onChange={(value) => set("lowStockReviewThreshold", Number.parseInt(value, 10) || 0)}
            isInteger
          />
          <NumberField
            id="cooling-off"
            label="Cooling-off after failures (minutes)"
            value={draft.coolingOffMinutesAfterFailures.toString()}
            onChange={(value) => set("coolingOffMinutesAfterFailures", Number.parseInt(value, 10) || 0)}
            isInteger
          />
          <NumberField
            id="recovery-attempts"
            label="Max recovery attempts per case"
            value={draft.maxRecoveryAttempts.toString()}
            onChange={(value) => set("maxRecoveryAttempts", Number.parseInt(value, 10) || 1)}
            isInteger
          />
          <ToggleRow
            id="recovery-enabled"
            label="Revenue recovery enabled"
            checked={draft.recoveryEnabled}
            onCheckedChange={(checked) => set("recoveryEnabled", checked)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save as new policy version
        </Button>
        {message && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Wand2 className="size-3.5" />
            {message}
          </p>
        )}
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  isInteger = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  isInteger?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={isInteger ? "numeric" : "decimal"}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(isInteger ? raw.replace(/[^\d]/g, "") : raw.replace(/[^\d.]/g, ""));
        }}
        className="h-9"
      />
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
