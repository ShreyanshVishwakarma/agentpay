"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTOR_STYLES: Record<string, string> = {
  BUYER: "bg-foreground",
  AGENT: "bg-primary",
  POLICY_ENGINE: "bg-primary/50",
  SYSTEM: "bg-muted-foreground/40",
  RAZORPAY: "bg-emerald-600",
};

const EVENT_TONE: Record<string, string> = {
  POLICY_REJECTED: "text-red-700",
  INTENT_PARSE_FAILED: "text-red-700",
  PAYMENT_SIGNATURE_REJECTED: "text-red-700",
  PAYMENT_MARKED_FAILED: "text-red-700",
  RAZORPAY_ORDER_CREATION_FAILED: "text-red-700",
  POLICY_APPROVED: "text-emerald-700",
  PAYMENT_SIGNATURE_VERIFIED: "text-emerald-700",
  DUPLICATE_SESSION_REUSED: "text-amber-700",
};

const EVENT_SUMMARIES: Record<string, string> = {
  INTENT_RECEIVED: "Buyer request received",
  INTENT_PARSED: "Request parsed into structured intent",
  INTENT_PARSE_FAILED: "Request could not be parsed safely",
  POLICY_CHECK_STARTED: "Deterministic policy checks started",
  POLICY_APPROVED: "Policy engine approved the cart",
  POLICY_REJECTED: "Policy engine rejected the request",
  CHECKOUT_PREVIEW_CREATED: "Checkout preview created for buyer review",
  BUYER_CONFIRMED: "Buyer explicitly confirmed checkout",
  DUPLICATE_SESSION_REUSED:
    "Existing secure checkout reused; no duplicate order created",
  RAZORPAY_ORDER_CREATE_STARTED: "Creating Razorpay test order",
  RAZORPAY_ORDER_CREATED: "Razorpay test order created",
  RAZORPAY_ORDER_CREATION_FAILED: "Razorpay order creation failed",
  CHECKOUT_OPENED: "Razorpay checkout handed to buyer",
  PAYMENT_CALLBACK_RECEIVED: "Payment callback received from checkout",
  PAYMENT_SIGNATURE_VERIFIED: "Payment signature verified server-side",
  PAYMENT_SIGNATURE_REJECTED: "Payment signature failed verification",
  PAYMENT_MARKED_FAILED: "Payment marked as failed; no fulfillment",
};

export interface TimelineEvent {
  id: string;
  eventType: string;
  actor: string;
  payload: unknown;
  previousHash: string | null;
  eventHash: string;
  createdAt: string;
}

function HashChip({ hash }: { hash: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!hash) {
    return (
      <span className="font-mono text-[10px] text-muted-foreground">
        prev: ∅ (genesis)
      </span>
    );
  }

  return (
    <button
      type="button"
      title={hash}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(hash);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard unavailable — no-op in demo.
        }
      }}
      className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "copied" : `${hash.slice(0, 10)}…`}
    </button>
  );
}

export function AuditTimeline({
  events,
  compact = false,
}: {
  events: TimelineEvent[];
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No audit events yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const isExpanded = expanded.has(event.id);
        const summary = EVENT_SUMMARIES[event.eventType] ?? event.eventType;

        return (
          <li key={event.id} className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-background",
                  ACTOR_STYLES[event.actor] ?? "bg-muted-foreground/30",
                )}
                title={event.actor}
              />
              {!isLast && <span className="w-px flex-1 bg-border" />}
            </div>

            <div
              className={cn(
                "min-w-0 flex-1 rounded-lg border border-border/70 bg-card px-3 py-2",
                isLast && "mb-0",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium">
                  <span className={EVENT_TONE[event.eventType] ?? "text-foreground"}>
                    {summary}
                  </span>
                  {!compact && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {event.actor}
                    </span>
                  )}
                </p>
                <time className="font-mono text-[10px] text-muted-foreground">
                  {new Date(event.createdAt).toLocaleTimeString("en-IN", {
                    hour12: false,
                  })}
                </time>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <HashChip hash={event.previousHash} />
                <HashChip hash={event.eventHash} />
                <button
                  type="button"
                  onClick={() => toggle(event.id)}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  payload
                  <ChevronDown
                    className={cn(
                      "size-3 transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                </button>
              </div>

              {isExpanded && (
                <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-foreground p-3 font-mono text-[11px] leading-relaxed text-background">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
