"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  History,
  Info,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AgentChat } from "@/components/agent/agent-chat";
import { ChatTranscript } from "@/components/agent/chat-transcript";
import type { TranscriptEntry } from "@/components/agent/chat-transcript";
import { IntentCard } from "@/components/agent/intent-card";
import { CheckoutPreview } from "@/components/agent/checkout-preview";
import {
  PolicyChecklist,
  PolicyRejectionList,
} from "@/components/agent/policy-checklist";
import { PaymentStatus } from "@/components/agent/payment-status";
import type { PaymentStage } from "@/components/agent/payment-status";
import { AuditTimeline } from "@/components/audit/audit-timeline";
import type {
  AuditFeedResponse,
  AuditEventDto,
  ConfirmOrderCreated,
  ConfirmResponse,
  InterpretOk,
  PreviewApproved,
  PreviewRejected,
  VerifyResponse,
} from "@/components/agent/types";
import type { PurchaseIntent } from "@/schemas/agent";

type Phase =
  | "idle"
  | "parsing"
  | "previewing"
  | "ready"
  | "confirming"
  | "order_created"
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

function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AgentWorkspace({
  resumeSessionId = null,
}: {
  resumeSessionId?: string | null;
}) {
  const [phase, setPhase] = useState<Phase>(resumeSessionId ? "previewing" : "idle");
  const [agentMode, setAgentMode] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [addOnBusySku, setAddOnBusySku] = useState<string | null>(null);
  const [mode, setMode] = useState<"llm" | "fallback" | null>(null);
  const [intent, setIntent] = useState<PurchaseIntent | null>(null);
  const [preview, setPreview] = useState<PreviewApproved | null>(null);
  const [rejection, setRejection] = useState<
    PreviewRejected | { message: string; suggestedAction?: string } | null
  >(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmOrderCreated | null>(
    null,
  );
  const [paymentStage, setPaymentStage] = useState<PaymentStage | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventDto[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const confirmingRef = useRef(false);

  const pushErrorNote = useCallback((text: string) => {
    setTranscript((prev) => [
      ...prev,
      { id: newEntryId(), kind: "note", tone: "error", text },
    ]);
  }, []);

  const refreshAudit = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/audit/${id}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as AuditFeedResponse;
      setAuditEvents(data.events);
    } catch {
      // Non-critical — the timeline just stays stale.
    }
  }, []);

  // Resume flow: /buy?resume=<sessionId> re-validates the session server-side
  // and shows the standard confirmation UI.
  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/checkout/session/${resumeSessionId}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as
          | (Omit<PreviewApproved, "status"> & { status: "RESUMABLE" })
          | { error: { code: string; message: string } };
        if (cancelled) return;
        if ("error" in data) {
          setParseError(data.error.message);
          setPhase("idle");
          return;
        }
        setSessionId(data.sessionId);
        setPreview({ ...data, status: "AWAITING_CONFIRMATION" });
        setPhase("ready");
        setTranscript((prev) => [
          ...prev,
          {
            id: newEntryId(),
            kind: "note",
            tone: "info",
            text: "Resumed your saved checkout — review the cart and confirm below.",
          },
        ]);
        void refreshAudit(data.sessionId);
      } catch {
        if (!cancelled) {
          setParseError("Could not resume this checkout. Please start a new request.");
          setPhase("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeSessionId, refreshAudit]);

  const handleSubmit = useCallback(
    async (message: string) => {
      confirmingRef.current = false;
      setPhase("parsing");
      setParseError(null);
      setNotice(null);
      setPreview(null);
      setRejection(null);
      setConfirmResult(null);
      setPaymentStage(null);
      setFailureMessage(null);
      setSessionId(null);
      setAuditEvents([]);
      setMode(null);
      setTranscript([{ id: newEntryId(), kind: "user", text: message }]);
      setStatusText(
        agentMode ? "Reading the catalog and building your cart…" : "Parsing your request…",
      );

      if (agentMode) {
        // Autonomous buying-agent loop: the LLM drives merchant API tools.
        try {
          const response = await postJson<
            | {
                mode: "llm" | "fallback";
                trace: Array<{ tool: string; args: Record<string, unknown>; resultSummary: string }>;
                outcome:
                  | { type: "proposal"; sessionId: string; preview: PreviewApproved }
                  | { type: "rejection"; code: string; message: string }
                  | { type: "clarification"; question: string };
              }
            | { error: { message: string } }
          >("/api/agent/v1/chat", { message });

          if ("error" in response) {
            setStatusText(null);
            setParseError(response.error.message);
            pushErrorNote(response.error.message);
            setPhase("idle");
            return;
          }

          setMode(response.mode);
          setTranscript((prev) => [
            ...prev,
            ...response.trace.map((step, index) => ({
              id: newEntryId(),
              kind: "tool" as const,
              index: index + 1,
              tool: step.tool,
              summary: step.resultSummary,
            })),
          ]);

          if (response.outcome.type === "proposal") {
            setStatusText(null);
            setSessionId(response.outcome.sessionId);
            setPreview(response.outcome.preview);
            setNotice("The agent built this cart autonomously. You decide whether to pay.");
            setPhase("ready");
            void refreshAudit(response.outcome.sessionId);
          } else if (response.outcome.type === "rejection") {
            setStatusText(null);
            setRejection({
              message: response.outcome.message,
              suggestedAction: "Adjust the request within merchant policy.",
            });
            setPhase("failed");
            setSessionId(null);
          } else {
            setStatusText(null);
            setParseError(response.outcome.question);
            setPhase("idle");
          }
        } catch {
          setStatusText(null);
          setParseError("The buying agent could not complete your request.");
          pushErrorNote("The buying agent could not complete your request.");
          setPhase("idle");
        }
        return;
      }

      let intent: PurchaseIntent;
      let mode: "llm" | "fallback";
      try {
        const parsed = await postJson<
          InterpretOk | { error: { message: string } }
        >("/api/agent/interpret", { message });
        if ("error" in parsed) {
          setStatusText(null);
          setParseError(parsed.error.message);
          pushErrorNote(parsed.error.message);
          setPhase("idle");
          return;
        }
        intent = parsed.intent;
        mode = parsed.mode;
      } catch {
        setStatusText(null);
        setParseError("Could not reach the agent service. Please try again.");
        pushErrorNote("Could not reach the agent service. Please try again.");
        setPhase("idle");
        return;
      }

      setIntent(intent);
      setMode(mode);

      setPhase("previewing");
      setStatusText("Checking merchant policy…");
      try {
        const outcome = await postJson<
          PreviewApproved | PreviewRejected | { error: { message: string } }
        >("/api/checkout/preview", { intent, sourceMessage: message });

        setStatusText(null);

        if ("error" in outcome) {
          setParseError(outcome.error.message);
          pushErrorNote(outcome.error.message);
          setPhase("idle");
          return;
        }

        setSessionId(outcome.sessionId);
        void refreshAudit(outcome.sessionId);

        if (outcome.status === "REJECTED") {
          setRejection(outcome);
          setPhase("failed");
        } else {
          setPreview(outcome);
          if (outcome.reusedSession) {
            setNotice(
              "Existing secure checkout reused; no duplicate order was created.",
            );
          }
          setPhase("ready");
        }
      } catch {
        setStatusText(null);
        setParseError("Could not prepare your checkout. Please try again.");
        pushErrorNote("Could not prepare your checkout. Please try again.");
        setPhase("idle");
      }
    },
    [agentMode, pushErrorNote, refreshAudit],
  );

  const verifyPaymentCallback = useCallback(
    async (
      result: ConfirmOrderCreated,
      callback: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      },
    ) => {
      setPaymentStage("verifying");
      setPhase("verifying");
      try {
        const verification = await postJson<VerifyResponse>("/api/payments/verify", {
          checkoutSessionId: result.sessionId,
          razorpay_payment_id: callback.razorpay_payment_id,
          razorpay_order_id: callback.razorpay_order_id,
          razorpay_signature: callback.razorpay_signature,
        });
        if (verification.verified) {
          setPaymentStage("verified");
          setPhase("verified");
          setTranscript((prev) => [
            ...prev,
            {
              id: newEntryId(),
              kind: "note",
              tone: "success",
              text: "Payment verified server-side — stock fulfilled and recorded in the audit chain.",
            },
          ]);
        } else {
          setPaymentStage("failed");
          setFailureMessage(verification.message ?? null);
          setPhase("failed");
          pushErrorNote(verification.message ?? "Verification failed. No fulfillment occurred.");
        }
      } catch {
        setPaymentStage("failed");
        setFailureMessage("Verification request failed. No fulfillment occurred.");
        setPhase("failed");
        pushErrorNote("Verification request failed. No fulfillment occurred.");
      }
      void refreshAudit(result.sessionId);
    },
    [pushErrorNote, refreshAudit],
  );

  const openRazorpayCheckout = useCallback(
    async (result: ConfirmOrderCreated) => {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setPaymentStage("failed");
        setFailureMessage(
          "Could not load Razorpay Checkout. Check your connection and retry confirmation.",
        );
        setPhase("failed");
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
          setPaymentStage("submitted");
          void verifyPaymentCallback(result, callback);
        },
        modal: {
          ondismiss: () => {
            setNotice(
              "Test checkout was dismissed before payment. You can confirm again to retry.",
            );
            setPhase("order_created");
          },
        },
      });
      checkout.open();
    },
    [verifyPaymentCallback],
  );

  const handleAddAddOn = useCallback(
    async (sku: string) => {
      if (!preview) return;
      setAddOnBusySku(sku);
      try {
        const intent: PurchaseIntent = {
          items: [
            ...preview.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
            { sku, quantity: 1 },
          ],
          maxBudgetPaise: preview.budgetPaise ?? undefined,
          clarificationNeeded: false,
        };
        const outcome = await postJson<
          PreviewApproved | PreviewRejected | { error: { message: string } }
        >("/api/checkout/preview", {
          intent,
          sourceMessage: `add-on ${sku}`,
        });
        if ("error" in outcome) {
          setNotice(outcome.error.message);
          return;
        }
        if (outcome.status === "REJECTED") {
          setRejection(outcome);
          setPreview(null);
          setPhase("failed");
          return;
        }
        setPreview(outcome);
        setSessionId(outcome.sessionId);
        void refreshAudit(outcome.sessionId);
      } catch {
        setNotice("Could not add the suggestion. Please retry.");
      } finally {
        setAddOnBusySku(null);
      }
    },
    [preview, refreshAudit],
  );

  const handleConfirm = useCallback(async () => {
    if (!preview || confirmingRef.current) return;
    confirmingRef.current = true;
    setPhase("confirming");
    setNotice(null);
    setStatusText("Creating secure test checkout…");

    try {
      const outcome = await postJson<ConfirmResponse>("/api/checkout/confirm", {
        sessionId: preview.sessionId,
      });

      if ("error" in outcome) {
        setStatusText(null);
        if (outcome.error.code === "RAZORPAY_ORDER_CREATION_FAILED") {
          setPaymentStage("demo_unavailable");
          setPhase("failed");
        } else {
          setRejection({ message: outcome.error.message });
          setPhase("failed");
        }
        void refreshAudit(preview.sessionId);
        return;
      }

      if (outcome.status === "REJECTED") {
        setStatusText(null);
        setRejection(outcome);
        setPreview(null);
        setPhase("failed");
        void refreshAudit(outcome.sessionId);
        return;
      }

      setConfirmResult(outcome);
      setSessionId(outcome.sessionId);

      if (outcome.reused) {
        setNotice(
          "Existing secure checkout reused; no duplicate order was created.",
        );
      }

      void refreshAudit(outcome.sessionId);
      setPhase("order_created");
      await openRazorpayCheckout(outcome);
    } catch {
      setStatusText(null);
      setRejection({
        message: "Confirmation failed due to a network error. Please retry.",
      });
      setPhase("failed");
    } finally {
      confirmingRef.current = false;
      setStatusText(null);
    }
  }, [preview, openRazorpayCheckout, refreshAudit]);

  const busy = phase === "parsing" || phase === "previewing";
  const showWorkspaceColumn =
    intent !== null || preview !== null || rejection !== null || parseError !== null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Left: conversation panel */}
        <div className="flex h-[540px] flex-col overflow-hidden rounded-2xl bg-card shadow-card-tinted ring-1 ring-foreground/[0.06]">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div>
              <p className="font-display text-sm font-semibold tracking-tight">
                Agent checkout
              </p>
              <p className="text-[11px] text-muted-foreground">
                Test mode · nothing is charged without you
                {mode && (
                  <span
                    className={
                      mode === "fallback"
                        ? "ml-1.5 font-medium text-amber-700 dark:text-amber-400"
                        : "ml-1.5 font-medium text-primary"
                    }
                  >
                    · {mode === "fallback" ? "AI fallback" : "LLM parsing"}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="agent-mode"
                checked={agentMode}
                onCheckedChange={setAgentMode}
              />
              <Label
                htmlFor="agent-mode"
                className="flex items-center gap-1 text-xs font-medium"
              >
                <Bot className="size-3.5 text-primary" />
                Agent mode
              </Label>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <ChatTranscript
              entries={transcript}
              status={statusText}
              onPickPrompt={(prompt) => void handleSubmit(prompt)}
            />
          </div>

          <AgentChat onSubmit={handleSubmit} busy={busy} />
        </div>

        {/* Right: policy decision + checkout */}
        <div className="space-y-4">
          {!showWorkspaceColumn && (
            <Card className="border-dashed shadow-none ring-border">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <ScrollText className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  Your checkout decision will appear here
                </p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Server-calculated totals, transparent policy checks, and an
                  explicit confirmation gate before any payment.
                </p>
              </CardContent>
            </Card>
          )}

          {intent && <IntentCard intent={intent} mode={mode} />}

          {rejection && (
            <PolicyRejectionList
              message={rejection.message}
              suggestedAction={
                "suggestedAction" in rejection && rejection.suggestedAction
                  ? rejection.suggestedAction
                  : "Try one of the suggested prompts."
              }
            />
          )}

          {preview && (
            <>
              <PolicyChecklist explanations={preview.policyExplanation} />
              <CheckoutPreview
                preview={preview}
                onConfirm={handleConfirm}
                confirming={phase === "confirming"}
                onAddAddOn={handleAddAddOn}
                addOnBusySku={addOnBusySku}
              />
            </>
          )}

          {notice && (
            <p className="flex items-center gap-2 rounded-lg border border-primary/25 bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
              <Info className="size-3.5 shrink-0 text-primary" />
              {notice}
            </p>
          )}

          {paymentStage && (
            <PaymentStatus
              stage={paymentStage}
              confirmResult={confirmResult}
              failureMessage={failureMessage}
              sessionId={sessionId}
            />
          )}
        </div>
      </div>

      {/* Recent audit events for the current session */}
      {sessionId && auditEvents.length > 0 && (
        <Card className="shadow-card-tinted">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="size-4 text-primary" />
                  Session audit trail
                </CardTitle>
                <CardDescription>
                  Hash-chained events — every decision is tamper-evident.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={`/audit/${sessionId}`}>
                  Full trail
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <AuditTimeline events={auditEvents.slice(-6)} compact />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
