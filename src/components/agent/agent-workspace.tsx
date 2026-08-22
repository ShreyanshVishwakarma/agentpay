"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AgentChat } from "@/components/agent/agent-chat";
import { ChatTranscript } from "@/components/agent/chat-transcript";
import type { TranscriptEntry } from "@/components/agent/chat-transcript";
import { useReadAloud } from "@/hooks/use-read-aloud";
import { CheckoutDialog } from "@/components/agent/checkout-dialog";
import { cn } from "@/lib/utils";
import type {
  ConfirmOrderCreated,
  ConfirmResponse,
  InterpretOk,
  PreviewApproved,
  PreviewRejected,
  VerifyResponse,
} from "@/components/agent/types";
import type { PaymentStage } from "@/components/agent/payment-status";
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewApproved | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmOrderCreated | null>(
    null,
  );
  const [paymentStage, setPaymentStage] = useState<PaymentStage | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const confirmingRef = useRef(false);
  const { enabled: readAloud, toggle: toggleReadAloud, speak } = useReadAloud();
  const spokenNotesRef = useRef(0);

  // Speak each new agent note when read-aloud is enabled.
  useEffect(() => {
    const notes = transcript.filter((entry) => entry.kind === "note");
    if (notes.length > spokenNotesRef.current) {
      const latest = notes[notes.length - 1];
      if (latest && latest.kind === "note") speak(latest.text);
    }
    spokenNotesRef.current = notes.length;
  }, [transcript, speak]);

  const pushErrorNote = useCallback((text: string) => {
    setTranscript((prev) => [
      ...prev,
      { id: newEntryId(), kind: "note", tone: "error", text },
    ]);
  }, []);

  const pushInfoNote = useCallback((text: string) => {
    setTranscript((prev) => [
      ...prev,
      { id: newEntryId(), kind: "note", tone: "info", text },
    ]);
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
          setPhase("idle");
          return;
        }
        setSessionId(data.sessionId);
        setPreview({ ...data, status: "AWAITING_CONFIRMATION" });
        setCheckoutOpen(true);
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
      } catch {
        if (!cancelled) {
          setPhase("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeSessionId]);

  const handleSubmit = useCallback(
    async (message: string) => {
      confirmingRef.current = false;
      setPhase("parsing");
      setNotice(null);
      setPreview(null);
      setConfirmResult(null);
      setPaymentStage(null);
      setFailureMessage(null);
      setSessionId(null);
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
            pushErrorNote(response.error.message);
            setPhase("idle");
            return;
          }
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
            setCheckoutOpen(true);
            setPhase("ready");
          } else if (response.outcome.type === "rejection") {
            setStatusText(null);
            pushErrorNote(
              `${response.outcome.code}: ${response.outcome.message}`,
            );
            setPhase("failed");
            setSessionId(null);
          } else {
            setStatusText(null);
            pushInfoNote(response.outcome.question);
            setPhase("idle");
          }
        } catch {
          setStatusText(null);
          pushErrorNote("The buying agent could not complete your request.");
          setPhase("idle");
        }
        return;
      }

      let intent: PurchaseIntent;
      try {
        const parsed = await postJson<
          InterpretOk | { error: { message: string } }
        >("/api/agent/interpret", { message });
        if ("error" in parsed) {
          setStatusText(null);
          pushErrorNote(parsed.error.message);
          setPhase("idle");
          return;
        }
        intent = parsed.intent;
      } catch {
        setStatusText(null);
        pushErrorNote("Could not reach the agent service. Please try again.");
        setPhase("idle");
        return;
      }

      setPhase("previewing");
      setStatusText("Checking merchant policy…");
      try {
        const outcome = await postJson<
          PreviewApproved | PreviewRejected | { error: { message: string } }
        >("/api/checkout/preview", { intent, sourceMessage: message });

        setStatusText(null);

        if ("error" in outcome) {
          pushErrorNote(outcome.error.message);
          setPhase("idle");
          return;
        }

        setSessionId(outcome.sessionId);

        if (outcome.status === "REJECTED") {
          setPhase("failed");
        } else {
          setPreview(outcome);
          setCheckoutOpen(true);
          if (outcome.reusedSession) {
            setNotice(
              "Existing secure checkout reused; no duplicate order was created.",
            );
          }
          setPhase("ready");
        }
      } catch {
        setStatusText(null);
        pushErrorNote("Could not prepare your checkout. Please try again.");
        setPhase("idle");
      }
    },
    [agentMode, pushErrorNote, pushInfoNote],
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
    },
    [pushErrorNote],
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
          setPreview(null);
          setPhase("failed");
          return;
        }
        setPreview(outcome);
        setSessionId(outcome.sessionId);
      } catch {
        setNotice("Could not add the suggestion. Please retry.");
      } finally {
        setAddOnBusySku(null);
      }
    },
    [preview],
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
          setPhase("failed");
        }
        return;
      }

      if (outcome.status === "REJECTED") {
        setStatusText(null);
        setPreview(null);
        setPhase("failed");
        return;
      }

      setConfirmResult(outcome);
      setSessionId(outcome.sessionId);

      if (outcome.reused) {
        setNotice(
          "Existing secure checkout reused; no duplicate order was created.",
        );
      }
      setPhase("order_created");
      await openRazorpayCheckout(outcome);
    } catch {
      setStatusText(null);
      setPhase("failed");
    } finally {
      confirmingRef.current = false;
      setStatusText(null);
    }
  }, [openRazorpayCheckout, preview]);

  const busy = phase === "parsing" || phase === "previewing";
  const proposalReady = phase === "ready" && preview !== null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col" style={{ minHeight: "calc(100vh - 4rem)" }}>
      <ChatTranscript
        entries={transcript}
        status={statusText}
        onPickPrompt={(prompt) => void handleSubmit(prompt)}
      />

      {proposalReady && !checkoutOpen && preview && (
        <button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
        >
          <span>
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Proposal ready
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {preview.formattedTotal}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {preview.items.length} item{preview.items.length === 1 ? "" : "s"} · policy approved
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            <ShieldCheck className="size-3.5" />
            Review & confirm
          </span>
        </button>
      )}

      {notice && <p className="mb-2 text-center text-[11px] text-muted-foreground">{notice}</p>}

      <AgentChat onSubmit={handleSubmit} busy={busy} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 pb-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-primary" />
          Nothing is charged without your explicit confirmation.
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleReadAloud(!readAloud)}
            aria-pressed={readAloud}
            title={readAloud ? "Mute reply voice" : "Read replies aloud"}
            className={cn(
              "flex size-6 items-center justify-center rounded-md border transition-colors",
              readAloud
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {readAloud ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
            <span className="sr-only">Read replies aloud</span>
          </button>
          <Switch
            id="agent-mode"
            checked={agentMode}
            onCheckedChange={setAgentMode}
          />
          <Label htmlFor="agent-mode" className="flex items-center gap-1 font-medium">
            <Bot className="size-3.5 text-primary" />
            Agent mode
          </Label>
          {sessionId && (
            <Link
              href={`/audit/${sessionId}`}
              className="font-medium text-indigo-600 hover:underline"
            >
              Audit trail
            </Link>
          )}
        </span>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        preview={preview}
        onConfirm={handleConfirm}
        confirming={phase === "confirming"}
        onAddAddOn={handleAddAddOn}
        addOnBusySku={addOnBusySku}
        paymentStage={paymentStage}
        confirmResult={confirmResult}
        failureMessage={failureMessage}
        sessionId={sessionId}
      />
    </div>
  );
}
