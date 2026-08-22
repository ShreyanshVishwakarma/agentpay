"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { PaymentStatus } from "@/components/agent/payment-status";
import type { ConfirmOrderCreated, ConfirmResponse, PreviewApproved, VerifyResponse } from "@/components/agent/types";
import { formatPaise } from "@/lib/money";

type Stage =
  | "loading"
  | "invalid"
  | "ready"
  | "confirming"
  | "order_created"
  | "submitted"
  | "verifying"
  | "verified"
  | "failed";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CheckoutClient({ sessionId }: { sessionId: string | null }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [preview, setPreview] = useState<PreviewApproved | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmOrderCreated | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOnBusySku, setAddOnBusySku] = useState<string | null>(null);
  const confirmingRef = useRef(false);

  // Load + server-side re-validate the session on mount.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/checkout/session/${sessionId}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as
          | (Omit<PreviewApproved, "status"> & { status: "RESUMABLE" })
          | { error: { code: string; message: string } };
        if (cancelled) return;
        if ("error" in data) {
          setInvalidMessage(data.error.message);
          setStage("invalid");
          return;
        }
        setPreview({ ...data, status: "AWAITING_CONFIRMATION" });
        setStage("ready");
      } catch {
        if (!cancelled) {
          setInvalidMessage("Could not load this checkout. Please start again.");
          setStage("invalid");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const verifyPaymentCallback = useCallback(
    async (
      result: ConfirmOrderCreated,
      callback: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      },
    ) => {
      setStage("verifying");
      try {
        const verification = await postJson<VerifyResponse>("/api/payments/verify", {
          checkoutSessionId: result.sessionId,
          razorpay_payment_id: callback.razorpay_payment_id,
          razorpay_order_id: callback.razorpay_order_id,
          razorpay_signature: callback.razorpay_signature,
        });
        if (verification.verified) {
          setStage("verified");
        } else {
          setStage("failed");
          setFailureMessage(verification.message ?? "Verification failed. No fulfillment occurred.");
        }
      } catch {
        setStage("failed");
        setFailureMessage("Verification request failed. No fulfillment occurred.");
      }
    },
    [],
  );

  const openRazorpayCheckout = useCallback(
    async (result: ConfirmOrderCreated) => {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setStage("failed");
        setFailureMessage("Could not load Razorpay Checkout. Check your connection and retry.");
        return;
      }

      const checkout = new window.Razorpay({
        key: result.razorpay.keyId,
        order_id: result.razorpay.orderId,
        amount: result.razorpay.amountPaise,
        currency: result.razorpay.currency,
        name: result.razorpay.merchantName,
        description: "AgentPay test-mode checkout",
        theme: { color: "#2f6b4f" },
        handler: (callback) => {
          setStage("submitted");
          void verifyPaymentCallback(result, callback);
        },
        modal: {
          ondismiss: () => {
            setNotice("Test checkout dismissed before payment — you can confirm again to retry.");
            setStage("order_created");
          },
        },
      });
      checkout.open();
    },
    [verifyPaymentCallback],
  );

  const handleConfirm = useCallback(async () => {
    if (!preview || confirmingRef.current) return;
    confirmingRef.current = true;
    setStage("confirming");
    setNotice(null);

    try {
      const outcome = await postJson<ConfirmResponse>("/api/checkout/confirm", {
        sessionId: preview.sessionId,
      });

      if ("error" in outcome) {
        setStage("failed");
        setFailureMessage(outcome.error.message);
        return;
      }

      if (outcome.status === "REJECTED") {
        setStage("failed");
        setFailureMessage(`${outcome.reason}: ${outcome.message}`);
        return;
      }

      setConfirmResult(outcome);
      setNotice(null);
      setStage("order_created");
      await openRazorpayCheckout(outcome);
    } catch {
      setStage("failed");
      setFailureMessage("Confirmation failed due to a network error. Please retry.");
    } finally {
      confirmingRef.current = false;
    }
  }, [preview, openRazorpayCheckout]);

  async function handleAddAddOn(sku: string) {
    if (!preview || addOnBusySku) return;
    setAddOnBusySku(sku);
    try {
      const intent = {
        items: [
          ...preview.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
          { sku, quantity: 1 },
        ],
        maxBudgetPaise: preview.budgetPaise ?? undefined,
        clarificationNeeded: false,
      };
      const outcome = await postJson<
        PreviewApproved | { status: "REJECTED"; message: string } | { error: { message: string } }
      >("/api/checkout/preview", { intent, sourceMessage: `add-on ${sku}` });
      if ("error" in outcome) {
        setNotice(outcome.error.message);
        return;
      }
      if (outcome.status === "REJECTED") {
        setNotice(outcome.message);
        return;
      }
      setPreview(outcome);
    } catch {
      setNotice("Could not add the suggestion. Please retry.");
    } finally {
      setAddOnBusySku(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!sessionId) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <ShieldCheck className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No checkout selected</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Go back to the chat and let the agent build a proposal first.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/buy">Back to agent chat</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (stage === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Re-validating your checkout…
      </div>
    );
  }

  if (stage === "invalid") {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <ShieldCheck className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Checkout unavailable</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            {invalidMessage}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/buy">Back to agent chat</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!preview) return null;

  const addOns = (preview.recommendedAddOns ?? []).filter(
    (addOn) => !preview.items.some((item) => item.sku === addOn.sku),
  );

  return (
    <div className="space-y-4">
      <Link
        href="/buy"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to chat
      </Link>

      <Card className="shadow-card-tinted ring-1 ring-foreground/[0.06]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4 text-primary" />
              Secure checkout
            </CardTitle>
            <StatusBadge status={stage === "verified" ? "PAYMENT_VERIFIED" : "AWAITING_CONFIRMATION"} />
          </div>
          <CardDescription>
            Prices calculated server-side · test mode, no real money.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Items */}
          <div className="space-y-2">
            {preview.items.map((item) => (
              <div
                key={item.sku}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.itemName}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {item.sku} · {item.formattedUnitPrice} × {item.quantity}
                  </p>
                </div>
                <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                  {item.formattedLineTotal}
                </span>
              </div>
            ))}
          </div>

          {/* Upsells */}
          {addOns.length > 0 && stage === "ready" && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Agent suggestions
              </p>
              {addOns.map((addOn) => (
                <div
                  key={addOn.sku}
                  className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-accent/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {addOn.name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        +{addOn.formattedPrice}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground" title={addOn.bound}>
                      {addOn.reason} · {addOn.bound}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={addOnBusySku === addOn.sku}
                    onClick={() => handleAddAddOn(addOn.sku)}
                  >
                    {addOnBusySku === addOn.sku ? "Checking…" : "+ Add"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Totals */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">{preview.formattedTotal}</span>
            </div>
            {preview.remainingBudgetPaise !== null && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Remaining budget</span>
                <span className="tabular-nums text-emerald-700">
                  {formatPaise(preview.remainingBudgetPaise)}
                </span>
              </div>
            )}
          </div>

          {/* Policy checklist */}
          <div className="rounded-lg bg-muted/50 px-3 py-2.5">
            <ul className="space-y-1">
              {preview.policyExplanation.map((line) => (
                <li key={line} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* Action / payment state */}
          {(stage === "ready" || stage === "confirming") && (
            <Button className="w-full gap-2" disabled={stage === "confirming"} onClick={handleConfirm}>
              {stage === "confirming" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating secure checkout…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Create test order &amp; pay {preview.formattedTotal}
                </>
              )}
            </Button>
          )}

          {notice && stage !== "failed" && (
            <p className="text-center text-[11px] text-muted-foreground">{notice}</p>
          )}

          {(stage === "submitted" ||
            stage === "verifying" ||
            stage === "order_created" ||
            stage === "verified" ||
            stage === "failed") && (
            <PaymentStatus
              stage={
                stage === "order_created"
                  ? "order_created"
                  : stage === "submitted"
                    ? "submitted"
                    : stage === "verifying"
                      ? "verifying"
                      : stage === "verified"
                        ? "verified"
                        : "failed"
              }
              confirmResult={confirmResult}
              failureMessage={failureMessage ?? notice}
              sessionId={preview.sessionId}
            />
          )}

          {stage === "verified" && (
            <Link
              href={`/audit/${preview.sessionId}`}
              className="block text-center text-xs font-medium text-indigo-600 hover:underline"
            >
              View the full hash-chained audit trail →
            </Link>
          )}

          {(stage === "failed" || stage === "order_created") && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/buy">Back to chat to adjust or restart</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        Nothing is charged without the explicit confirmation above.
      </p>
    </div>
  );
}
