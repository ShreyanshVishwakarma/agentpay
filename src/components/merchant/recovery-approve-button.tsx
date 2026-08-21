"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RecoveryApproveButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; copyMode: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/recovery/${caseId}/approve`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        messagePreview?: string;
        copyMode?: string;
        error?: { message: string };
      };
      if (!response.ok) {
        setError(data.error?.message ?? "Approval failed.");
      } else {
        setResult({
          message: data.messagePreview ?? "",
          copyMode: data.copyMode ?? "template",
        });
        router.refresh();
      }
    } catch {
      setError("Network error during approval.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={approve} disabled={busy} className="gap-2">
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ShieldCheck className="size-4" />
        )}
        Approve simulated recovery
      </Button>

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-emerald-800">
            <CheckCircle2 className="size-4" />
            Simulated recovery executed
          </p>
          <p className="mt-1.5 rounded-md border border-border/60 bg-card px-3 py-2 text-xs leading-relaxed text-foreground">
            “{result.message}”
          </p>
          <p className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-emerald-700">
            <span>
              Copy mode: {result.copyMode === "llm" ? "LLM draft (guardrail-checked)" : "Template-generated recovery copy"}
            </span>
            <a
              href={`/recover/${caseId}`}
              className="inline-flex items-center gap-1 font-medium hover:underline"
            >
              Open buyer recovery page
              <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
