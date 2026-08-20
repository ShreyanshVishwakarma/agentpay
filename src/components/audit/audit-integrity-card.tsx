"use client";

import { useState } from "react";
import { CheckCircle2, Fingerprint, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AuditFeedResponse } from "@/components/agent/types";

export function AuditIntegrityCard({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: AuditFeedResponse["chainVerification"];
}) {
  const [verification, setVerification] = useState(initial);
  const [checking, setChecking] = useState(false);

  async function verify() {
    setChecking(true);
    try {
      const response = await fetch(`/api/audit/${sessionId}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as AuditFeedResponse;
        setVerification(data.chainVerification);
      }
    } catch {
      // Keep previous result on network failure.
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card
      className={
        verification.valid
          ? "border-emerald-200 bg-emerald-50/60 shadow-sm"
          : "border-red-200 bg-red-50/60 shadow-sm"
      }
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Fingerprint
            className={verification.valid ? "size-4 text-emerald-600" : "size-4 text-red-600"}
          />
          <span className={verification.valid ? "text-emerald-700" : "text-red-700"}>
            {verification.valid ? "Audit chain intact" : "Audit chain broken"}
          </span>
        </CardTitle>
        <CardDescription>
          Each event hashes the previous one: SHA-256(prevHash | event). Any
          tampering breaks every later link.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {verification.valid
            ? `Recomputed ${verification.checkedCount} link${verification.checkedCount === 1 ? "" : "s"} — all hashes match.`
            : (verification.reason ?? "Chain verification failed.")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={verify}
          disabled={checking}
          className="gap-1.5"
        >
          {checking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : verification.valid ? (
            <CheckCircle2 className="size-3.5 text-emerald-600" />
          ) : (
            <XCircle className="size-3.5 text-red-600" />
          )}
          Verify hash chain
        </Button>
      </CardContent>
    </Card>
  );
}
