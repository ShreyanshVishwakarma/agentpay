"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RecoveryQueueActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/merchant/recovery/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "both" }),
      });
      const data = (await response.json()) as {
        casesCreated?: number;
        casesExpired?: number;
        error?: { message: string };
      };
      if (!response.ok) {
        setError(data.error?.message ?? "Scan failed.");
      } else {
        setMessage(
          `Scan complete: ${data.casesCreated ?? 0} new case(s), ${data.casesExpired ?? 0} expired.`,
        );
        router.refresh();
      }
    } catch {
      setError("Network error during scan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={scan} disabled={busy} size="sm" className="gap-1.5">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Scan for opportunities
      </Button>
      {message && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="size-3.5" />
          {message}
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Scans are deterministic — no buyer is contacted without merchant approval.
      </p>
    </div>
  );
}
