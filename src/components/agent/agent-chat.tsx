"use client";

import { useState } from "react";
import { Keyboard, Loader2, Mic, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceComposer } from "@/components/agent/voice-composer";
import { cn } from "@/lib/utils";

const SUGGESTED_PROMPTS = [
  "Buy two SQL Pro Interview Packs under ₹800",
  "Get the Next.js Backend Pack",
  "Buy three SQL Pro Packs under ₹800",
];

function ComposerModeSwitch({
  mode,
  onChange,
}: {
  mode: "type" | "speak";
  onChange: (mode: "type" | "speak") => void;
}) {
  const options = [
    { key: "type" as const, label: "Type", icon: Keyboard },
    { key: "speak" as const, label: "Speak", icon: Mic },
  ];
  return (
    <div
      role="tablist"
      aria-label="Input mode"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.key}
          role="tab"
          aria-selected={mode === option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]",
            mode === option.key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <option.icon className="size-3" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AgentChat({
  onSubmit,
  busy,
}: {
  onSubmit: (message: string) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"type" | "speak">("type");
  const [message, setMessage] = useState("");

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessage("");
    onSubmit(trimmed);
  }

  return (
    <div className="border-t border-border/70 bg-card">
      {mode === "type" ? (
        <div className="p-3">
          <div className="flex items-center justify-between gap-2 pb-2">
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy}
                  onClick={() => submit(prompt)}
                  className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-all duration-200 hover:border-ring hover:bg-accent hover:text-accent-foreground active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <ComposerModeSwitch mode={mode} onChange={setMode} />
          </div>

          <div className="relative rounded-xl border border-input bg-background shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
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
              className="resize-none border-none px-3 pt-2.5 pb-9 text-sm shadow-none focus-visible:ring-0"
              disabled={busy}
            />
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                <Sparkles className="size-3 text-primary" />
                The AI only proposes — policy decides.
              </p>
              <Button
                type="button"
                size="icon-sm"
                className="rounded-lg"
                disabled={busy || message.trim().length === 0}
                onClick={() => submit(message)}
                aria-label="Send request"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-end px-3 pt-2">
            <ComposerModeSwitch mode={mode} onChange={setMode} />
          </div>
          <VoiceComposer onSubmit={(text) => submit(text)} busy={busy} />
        </div>
      )}
    </div>
  );
}
