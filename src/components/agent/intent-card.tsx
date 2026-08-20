"use client";

import { Bot, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PurchaseIntent } from "@/schemas/agent";
import { formatPaise } from "@/lib/money";

export function IntentCard({
  intent,
  mode,
}: {
  intent: PurchaseIntent;
  mode: "llm" | "fallback" | null;
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bot className="size-4 text-primary" />
            Structured intent
          </CardTitle>
          {mode && (
            <Badge
              variant="outline"
              className={
                mode === "fallback"
                  ? "border-amber-300 bg-amber-50 text-[10px] uppercase text-amber-700"
                  : "border-emerald-300 bg-emerald-50 text-[10px] uppercase text-emerald-700"
              }
            >
              {mode === "fallback" ? "AI fallback mode" : "LLM"}
            </Badge>
          )}
        </div>
        <CardDescription>
          Proposed by the AI, validated by Zod — never trusted on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <ul className="space-y-1.5">
          {intent.items.map((item) => (
            <li
              key={item.sku}
              className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-1.5 font-mono text-xs"
            >
              <span className="text-foreground">{item.sku}</span>
              <span className="text-muted-foreground">× {item.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Stated budget</span>
          <span className="font-medium text-foreground">
            {intent.maxBudgetPaise !== undefined
              ? formatPaise(intent.maxBudgetPaise)
              : "None"}
          </span>
        </div>
        {intent.clarificationNeeded && intent.clarificationQuestion && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <HelpCircle className="mt-0.5 size-3.5 shrink-0" />
            {intent.clarificationQuestion}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
