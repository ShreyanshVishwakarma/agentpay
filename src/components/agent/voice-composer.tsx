"use client";

import { useRef } from "react";
import { ArrowRight, Mic, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { cn } from "@/lib/utils";

const BAR_FACTORS = [0.55, 0.85, 1, 0.8, 0.5];

export function VoiceComposer({
  onSubmit,
  busy,
}: {
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const levelRef = useRef<HTMLDivElement>(null);
  const {
    supported,
    listening,
    interim,
    finalText,
    error,
    start,
    stop,
    reset,
  } = useVoiceInput({ levelTarget: levelRef });

  const draft = `${finalText}${interim}`.trim();
  const canSend = !busy && draft.length > 0;

  function send() {
    if (!canSend) return;
    onSubmit(draft);
    stop();
    reset();
  }

  function toggleListening() {
    if (listening) {
      stop();
    } else {
      void start();
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      {/* Live transcript */}
      <div
        aria-live="polite"
        className="flex min-h-[2.75rem] w-full max-w-sm items-start justify-center"
      >
        {error ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
            {error}
          </p>
        ) : draft ? (
          <p className="rounded-xl bg-muted/70 px-3.5 py-2 text-center text-sm leading-relaxed text-foreground">
            {draft}
            {listening && (
              <span className="voice-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 rounded-full bg-primary" />
            )}
          </p>
        ) : listening ? (
          <p className="shimmer pt-2 text-xs font-medium text-muted-foreground">
            Listening — say what you&apos;d like to buy…
          </p>
        ) : (
          <p className="pt-2 text-xs text-muted-foreground">
            Tap the mic and speak your order
          </p>
        )}
      </div>

      {/* Orb */}
      <div ref={levelRef} className="relative flex items-center justify-center">
        {/* Ripple rings */}
        {listening && (
          <>
            <span aria-hidden className="voice-ring absolute inset-0 rounded-full" />
            <span
              aria-hidden
              className="voice-ring absolute inset-0 rounded-full [animation-delay:900ms]"
            />
          </>
        )}

        {/* Waveform bars behind the orb */}
        <div
          aria-hidden
          className="absolute -inset-x-10 flex items-center justify-center gap-1.5 opacity-80"
        >
          {BAR_FACTORS.map((factor, i) => (
            <span
              key={i}
              className="h-7 w-1 origin-center rounded-full bg-primary/60"
              style={{
                transform: `scaleY(calc(0.18 + var(--voice-level, 0) * ${factor}))`,
                transition: "transform 90ms linear",
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={toggleListening}
          disabled={!supported || busy}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          className={cn(
            "group relative z-10 flex size-20 cursor-pointer items-center justify-center rounded-full outline-none transition-transform duration-300 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
            listening && "scale-105",
          )}
        >
          {/* Rotating conic halo */}
          <span
            aria-hidden
            className={cn(
              "absolute -inset-[3px] rounded-full opacity-90",
              "bg-[conic-gradient(from_0deg,var(--primary),color-mix(in_oklab,var(--primary)_35%,transparent),var(--primary))]",
              listening
                ? "animate-[spin_2.4s_linear_infinite]"
                : "animate-[spin_9s_linear_infinite] opacity-50",
            )}
          />
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full bg-card transition-shadow duration-500",
              listening
                ? "shadow-[0_0_0_1px_var(--primary),0_8px_32px_-4px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
                : "shadow-card-tinted group-hover:shadow-lifted-tinted",
            )}
          />
          <Mic
            className={cn(
              "relative size-7 transition-colors duration-300",
              listening ? "text-primary" : "text-foreground/70",
            )}
          />
        </button>
      </div>

      {/* Status line */}
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
        {!supported
          ? "Voice input needs Chrome, Edge, or another Chromium browser"
          : listening
            ? "Tap the orb to stop"
            : busy
              ? "Working on your last request…"
              : finalText
                ? "Send it, or record again"
                : "Voice input · test mode"}
      </p>

      {/* Actions */}
      <div className="flex min-h-9 items-center gap-2">
        {finalText && !listening && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
            }}
            className="gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            Record again
          </Button>
        )}
        {(finalText || interim) && (
          <Button
            type="button"
            size="sm"
            disabled={!canSend}
            onClick={send}
            className="gap-1.5"
          >
            <Send className="size-3.5" />
            Send request
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
