"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AgentChat } from "@/components/agent/agent-chat";
import { ChatTranscript } from "@/components/agent/chat-transcript";
import type { TranscriptEntry } from "@/components/agent/chat-transcript";
import { useReadAloud } from "@/hooks/use-read-aloud";
import type {
  ConfirmOrderCreated,
  InterpretOk,
  PreviewApproved,
  VerifyResponse,
} from "@/components/agent/types";

type Phase = "idle" | "parsing" | "previewing" | "redirecting";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Centered buyer chat. On an approved proposal it hands off to the
 * dedicated /checkout page, which owns confirmation, Razorpay and
 * verification states.
 */
export function AgentWorkspace({
  resumeSessionId = null,
}: {
  resumeSessionId?: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(resumeSessionId ? "redirecting" : "idle");
  const [agentMode, setAgentMode] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [statusText, setStatusText] = useState<string | null>(
    resumeSessionId ? "Resuming your saved checkout…" : null,
  );
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

  const goToCheckout = useCallback(
    (sessionId: string, summary: string) => {
      setPhase("redirecting");
      setStatusText(null);
      pushInfoNote(summary);
      router.push(`/checkout?session=${sessionId}`);
    },
    [router, pushInfoNote],
  );

  // Legacy resume links (/buy?resume=…) forward to the checkout page.
  useEffect(() => {
    if (!resumeSessionId) return;
    router.replace(`/checkout?session=${resumeSessionId}`);
  }, [resumeSessionId, router]);

  const handleSubmit = useCallback(
    async (message: string) => {
      confirmingRef.current = false;
      setPhase("parsing");
      setTranscript([{ id: newEntryId(), kind: "user", text: message }]);
      setStatusText(
        agentMode ? "Reading the catalog and building your cart…" : "Parsing your request…",
      );

      if (agentMode) {
        try {
          const response = await postJson<
            | {
                mode: "llm" | "fallback";
                trace: Array<{ tool: string; args: Record<string, unknown>; resultSummary: string }>;
                outcome:
                  | { type: "proposal"; sessionId: string; totalPaise?: number }
                  | { type: "rejection"; code: string; message: string }
                  | { type: "clarification"; question: string };
              }
            | { error: { message: string } }
          >("/api/agent/v1/chat", { message });

          setStatusText(null);

          if ("error" in response) {
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
            goToCheckout(
              response.outcome.sessionId,
              `Proposal ready — taking you to secure checkout.`,
            );
          } else if (response.outcome.type === "rejection") {
            pushErrorNote(
              `${response.outcome.code}: ${response.outcome.message} — No payment action was taken.`,
            );
            setPhase("idle");
          } else {
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

      let intent: PurchaseIntentLike;
      try {
        const parsed = await postJson<
          InterpretOk | { error: { message: string } }
        >("/api/agent/interpret", { message });
        setStatusText("Checking merchant policy…");
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

      try {
        const outcome = await postJson<
          PreviewApproved | { status: "REJECTED"; reason: string; message: string } | { error: { message: string } }
        >("/api/checkout/preview", { intent, sourceMessage: message });

        setStatusText(null);

        if ("error" in outcome) {
          pushErrorNote(outcome.error.message);
          setPhase("idle");
          return;
        }

        if (outcome.status === "REJECTED") {
          pushErrorNote(`${outcome.reason}: ${outcome.message} — No payment action was taken.`);
          setPhase("idle");
          return;
        }

        goToCheckout(outcome.sessionId, "Policy approved — taking you to secure checkout.");
      } catch {
        setStatusText(null);
        pushErrorNote("Could not prepare your checkout. Please try again.");
        setPhase("idle");
      }
    },
    [agentMode, goToCheckout, pushErrorNote, pushInfoNote],
  );

  void confirmingRef;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col" style={{ minHeight: "calc(100vh - 4rem)" }}>
      <ChatTranscript
        entries={transcript}
        status={statusText}
        onPickPrompt={(prompt) => void handleSubmit(prompt)}
      />

      <AgentChat onSubmit={handleSubmit} busy={phase !== "idle"} />

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
            className={
              readAloud
                ? "flex size-6 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary"
                : "flex size-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
            }
          >
            {readAloud ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
            <span className="sr-only">Read replies aloud</span>
          </button>
          <Switch id="agent-mode" checked={agentMode} onCheckedChange={setAgentMode} />
          <Label htmlFor="agent-mode" className="flex items-center gap-1 font-medium">
            <Bot className="size-3.5 text-primary" />
            Agent mode
          </Label>
        </span>
      </div>
    </div>
  );
}

interface PurchaseIntentLike {
  items: Array<{ sku: string; quantity: number }>;
  maxBudgetPaise?: number;
  clarificationNeeded: boolean;
}

// Kept referenced so tree-shaking never drops shared payment types used by
// the dedicated checkout page.
export type { ConfirmOrderCreated, VerifyResponse };
