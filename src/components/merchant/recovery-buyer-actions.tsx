"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RecoveryBuyerActions({
  caseId,
  resumeHref,
  canResume,
  hasAlternative,
}: {
  caseId: string;
  resumeHref: string;
  canResume: boolean;
  hasAlternative: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"alternative" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acceptAlternative() {
    setBusy("alternative");
    setError(null);
    try {
      const response = await fetch(`/api/recovery/${caseId}/accept-alternative`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        resumeUrl?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.resumeUrl) {
        setError(data.error?.message ?? "Could not prepare the alternative.");
        return;
      }
      router.push(data.resumeUrl);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      const response = await fetch(`/api/recovery/${caseId}/decline`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: { message: string } };
        setError(data.error?.message ?? "Could not decline.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canResume && (
          <Button asChild className="gap-2">
            <a href={resumeHref}>
              <ShieldCheck className="size-4" />
              Resume original checkout
            </a>
          </Button>
        )}
        {hasAlternative && (
          <Button
            variant="outline"
            onClick={acceptAlternative}
            disabled={busy !== null}
            className="gap-2"
          >
            {busy === "alternative" ? <Loader2 className="size-4 animate-spin" /> : null}
            Accept available alternative
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={decline}
          disabled={busy !== null}
          className="gap-2 text-muted-foreground"
        >
          {busy === "decline" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
          No thanks — decline
        </Button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Any checkout you start still runs full merchant policy checks and
        requires your explicit confirmation before payment.
      </p>
    </div>
  );
}
