"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CheckoutPreview } from "@/components/agent/checkout-preview";
import {
  PolicyChecklist,
} from "@/components/agent/policy-checklist";
import { PaymentStatus } from "@/components/agent/payment-status";
import type { PaymentStage } from "@/components/agent/payment-status";
import type {
  ConfirmOrderCreated,
  PreviewApproved,
} from "@/components/agent/types";

/**
 * The entire money conversation — cart, policy checks, confirmation,
 * Razorpay launch and verification status — lives in this focused popup,
 * keeping the buyer chat clean.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
  confirming,
  onAddAddOn,
  addOnBusySku,
  paymentStage,
  confirmResult,
  failureMessage,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: PreviewApproved | null;
  onConfirm: () => void;
  confirming: boolean;
  onAddAddOn: (sku: string) => void;
  addOnBusySku: string | null;
  paymentStage: PaymentStage | null;
  confirmResult: ConfirmOrderCreated | null;
  failureMessage: string | null;
  sessionId: string | null;
}) {
  const settled =
    paymentStage === "verified" || paymentStage === "failed" || paymentStage === "demo_unavailable";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-left">Secure checkout</DialogTitle>
          <DialogDescription className="text-left">
            Server-priced · policy-checked · test mode — no real money.
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="space-y-4">
            <CheckoutPreview
              preview={preview}
              onConfirm={onConfirm}
              confirming={confirming}
              onAddAddOn={onAddAddOn}
              addOnBusySku={addOnBusySku}
              compact
            />
            {!settled && (
              <>
                <Separator />
                <PolicyChecklist explanations={preview.policyExplanation} />
              </>
            )}
          </div>
        )}

        {paymentStage && (
          <div className="mt-1">
            <PaymentStatus
              stage={paymentStage}
              confirmResult={confirmResult}
              failureMessage={failureMessage}
              sessionId={sessionId}
            />
          </div>
        )}

        {paymentStage === "verified" && sessionId && (
          <Link
            href={`/audit/${sessionId}`}
            className="block text-center text-xs font-medium text-indigo-600 hover:underline"
            onClick={() => onOpenChange(false)}
          >
            View the full hash-chained audit trail →
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
