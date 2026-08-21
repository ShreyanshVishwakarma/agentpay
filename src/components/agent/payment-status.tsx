"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPaise } from "@/lib/money";
import type { ConfirmOrderCreated } from "@/components/agent/types";

export type PaymentStage =
  | "order_created"
  | "submitted"
  | "verifying"
  | "verified"
  | "failed"
  | "demo_unavailable";

const STAGE_META: Record<
  Exclude<PaymentStage, "order_created" | "demo_unavailable">,
  { label: string; step: number }
> = {
  submitted: { label: "Payment submitted", step: 1 },
  verifying: { label: "Verifying payment", step: 2 },
  verified: { label: "Payment verified", step: 3 },
  failed: { label: "Payment verification failed", step: 3 },
};

export function PaymentStatus({
  stage,
  confirmResult,
  failureMessage,
  sessionId,
}: {
  stage: PaymentStage;
  confirmResult: ConfirmOrderCreated | null;
  failureMessage: string | null;
  sessionId: string | null;
}) {
  if (stage === "demo_unavailable") {
    return (
      <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="size-4" />
            Demo payment mode unavailable
          </CardTitle>
          <CardDescription className="text-amber-800">
            Razorpay test keys are not configured on this server. Preview,
            policy checks and the audit trail still work — add RAZORPAY_KEY_ID
            and RAZORPAY_KEY_SECRET to .env to run live test payments.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (stage === "order_created" && confirmResult) {
    return (
      <Card className="border-primary/25 bg-accent/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-accent-foreground">
            <CreditCard className="size-4 text-primary" />
            Test checkout ready
          </CardTitle>
          <CardDescription>
            Order{" "}
            <span className="font-mono text-xs">{confirmResult.razorpay.orderId}</span>{" "}
            · {formatPaise(confirmResult.razorpay.amountPaise)} · Test mode — no
            real money is charged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            The Razorpay test window should have opened in your browser. Use
            the standard test-mode success flow to complete payment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const meta = STAGE_META[stage as Exclude<PaymentStage, "order_created" | "demo_unavailable">];

  return (
    <Card
      className={
        stage === "verified"
          ? "border-emerald-200 bg-emerald-50/60 shadow-sm"
          : stage === "failed"
            ? "border-red-200 bg-red-50/60 shadow-sm"
            : "border-border/80 shadow-sm"
      }
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {stage === "verified" ? (
            <>
              <BadgeCheck className="size-4 text-emerald-600" />
              <span className="text-emerald-700">Payment verified</span>
            </>
          ) : stage === "failed" ? (
            <>
              <ShieldAlert className="size-4 text-red-600" />
              <span className="text-red-700">Payment verification failed</span>
            </>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>{meta?.label ?? "Processing…"}</span>
            </>
          )}
        </CardTitle>
        <CardDescription>
          {stage === "verified"
            ? "Signature verified server-side and stock fulfilled."
            : stage === "failed"
              ? (failureMessage ??
                "The signature did not match. No fulfillment occurred.")
              : "The popup saying “success” is not enough — AgentPay verifies the HMAC signature server-side before fulfilling."}
        </CardDescription>
      </CardHeader>
      {(stage === "verified" || stage === "failed") && sessionId && (
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/audit/${sessionId}`}>
              View full audit trail
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
          {stage === "verified" && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="size-3.5" />
              Fulfillment recorded in the tamper-evident audit chain.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
