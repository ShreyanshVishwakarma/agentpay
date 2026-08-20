"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const SUGGESTED_PROMPTS = [
  "Buy two SQL Pro Interview Packs under ₹800",
  "Get the Next.js Backend Pack",
  "Buy three SQL Pro Packs under ₹800",
  "Buy the Premium Interview Bundle",
];

export function AgentChat({
  onSubmit,
  busy,
  mode,
}: {
  onSubmit: (message: string) => void;
  busy: boolean;
  mode: "llm" | "fallback" | null;
}) {
  const [message, setMessage] = useState("");

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessage("");
    onSubmit(trimmed);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Try:
        </span>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={busy}
            onClick={() => submit(prompt)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="relative">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(message);
            }
          }}
          placeholder='e.g. "Buy two SQL Pro Interview Packs under ₹800"'
          rows={2}
          className="resize-none pr-12 text-sm"
          disabled={busy}
        />
        <Button
          type="button"
          size="icon"
          className="absolute bottom-2 right-2 size-8"
          disabled={busy || message.trim().length === 0}
          onClick={() => submit(message)}
          aria-label="Send request"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          {busy ? "Parsing your request…" : "The AI only extracts intent — it never sets prices or approves payments."}
        </p>
        {mode === "fallback" && (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-[10px] font-medium uppercase tracking-wide text-amber-700"
          >
            AI fallback mode
          </Badge>
        )}
        {mode === "llm" && (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-[10px] font-medium uppercase tracking-wide text-emerald-700"
          >
            LLM parsing
          </Badge>
        )}
      </div>
    </div>
  );
}
