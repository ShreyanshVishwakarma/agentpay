"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PolicyChecklist({
  explanations,
}: {
  explanations: string[];
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Policy checklist</CardTitle>
        <CardDescription>
          Deterministic server-side rules — the LLM has no vote here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {explanations.map((explanation) => (
            <li key={explanation} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span className="text-muted-foreground">{explanation}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PolicyRejectionList({
  message,
  suggestedAction,
}: {
  message: string;
  suggestedAction: string;
}) {
  return (
    <Card className="border-red-200 bg-red-50/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-red-700">
          <XCircle className="size-4" />
          Request rejected by policy engine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-red-800">{message}</p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Suggested next step: </span>
          {suggestedAction}
        </p>
        <p className="pt-1 text-xs font-medium text-red-700">
          No payment action was taken.
        </p>
      </CardContent>
    </Card>
  );
}
