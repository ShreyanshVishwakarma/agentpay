"use client";

import {
  AlertCircle,
  BadgeCheck,
  Bot,
  Info,
  Wrench,
} from "lucide-react";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/ui/marker";
import {
  Message,
  MessageContent,
} from "@/components/ui/message";
import {
  Bubble,
  BubbleContent,
} from "@/components/ui/bubble";
import {
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

export type TranscriptEntry =
  | { id: string; kind: "user"; text: string }
  | {
      id: string;
      kind: "tool";
      index: number;
      tool: string;
      summary: string;
    }
  | {
      id: string;
      kind: "note";
      tone: "info" | "success" | "error";
      text: string;
    };

function ToolMarker({
  index,
  tool,
  summary,
}: {
  index: number;
  tool: string;
  summary: string;
}) {
  return (
    <Marker className="text-xs">
      <MarkerIcon className="text-primary">
        <Wrench className="size-3.5" />
      </MarkerIcon>
      <MarkerContent className="truncate">
        <span className="font-mono font-medium text-foreground">
          {index}. {tool}()
        </span>
        <span className="text-muted-foreground"> — {summary}</span>
      </MarkerContent>
    </Marker>
  );
}

export function ChatTranscript({
  entries,
  status,
  onPickPrompt,
  className,
}: {
  entries: TranscriptEntry[];
  status: string | null;
  onPickPrompt?: (prompt: string) => void;
  className?: string;
}) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className={className}>
        <MessageScrollerViewport
          aria-label="Conversation with the buying agent"
          className="scroll-fade-b"
        >
          <MessageScrollerContent className="px-4 py-4 sm:px-5">
            {entries.length === 0 && !status ? (
              <div className="flex flex-col items-center gap-3 pt-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground ring-1 ring-primary/15">
                  <Bot className="size-5 text-primary" />
                </span>
                <div>
                  <p className="font-display text-base font-semibold tracking-tight text-foreground">
                    Ask for anything in the catalog
                  </p>
                  <p className="mx-auto mt-1 max-w-[34ch] text-xs leading-relaxed text-muted-foreground">
                    The agent proposes a cart. Policy checks every line.
                    Nothing is charged until you confirm.
                  </p>
                </div>
                {onPickPrompt && (
                  <div className="mt-2 flex w-full max-w-sm flex-col gap-1.5">
                    {[
                      "Buy two SQL Pro Interview Packs under ₹800",
                      "Get the Next.js Backend Pack",
                      "Buy three SQL Pro Packs under ₹800",
                      "Buy the Premium Interview Bundle",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => onPickPrompt(prompt)}
                        className="rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground transition-all duration-200 hover:border-ring hover:bg-accent hover:text-accent-foreground active:translate-y-px"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {entries.map((entry, index) => {
                  const isLast = index === entries.length - 1 && !status;
                  return (
                    <MessageScrollerItem
                      key={entry.id}
                      messageId={entry.id}
                      scrollAnchor={isLast}
                    >
                      {entry.kind === "user" && (
                        <Message align="end">
                          <MessageContent>
                            <Bubble variant="default">
                              <BubbleContent className="rounded-2xl rounded-br-md px-3.5 py-2">
                                {entry.text}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      )}

                      {entry.kind === "tool" && (
                        <ToolMarker
                          index={entry.index}
                          tool={entry.tool}
                          summary={entry.summary}
                        />
                      )}

                      {entry.kind === "note" && entry.tone === "info" && (
                        <Marker>
                          <MarkerIcon className="text-primary">
                            <Info className="size-4" />
                          </MarkerIcon>
                          <MarkerContent className="text-xs leading-relaxed">
                            {entry.text}
                          </MarkerContent>
                        </Marker>
                      )}

                      {entry.kind === "note" && entry.tone === "success" && (
                        <Message>
                          <MessageContent>
                            <Bubble variant="tinted" className="max-w-full">
                              <BubbleContent className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed">
                                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                                {entry.text}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      )}

                      {entry.kind === "note" && entry.tone === "error" && (
                        <Message>
                          <MessageContent>
                            <Bubble variant="destructive" className="max-w-full">
                              <BubbleContent className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed">
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                                {entry.text}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      )}
                    </MessageScrollerItem>
                  );
                })}

                {status && (
                  <MessageScrollerItem scrollAnchor>
                    <Marker className="text-xs">
                      <MarkerIcon className="animate-pulse text-primary">
                        <Bot className="size-3.5" />
                      </MarkerIcon>
                      <MarkerContent>
                        <span className="shimmer font-medium">
                          {status}
                        </span>
                      </MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                )}
              </>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
