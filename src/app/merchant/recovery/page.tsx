import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RecoveryQueueActions } from "@/components/merchant/recovery-queue-actions";
import { getRecoveryQueue } from "@/lib/recovery/recovery-service";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Recovery Queue — AgentPay",
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  ELIGIBLE: "border-amber-200 bg-amber-50 text-amber-700",
  PROPOSED: "border-primary/25 bg-accent text-accent-foreground",
  MERCHANT_APPROVED: "border-primary/25 bg-accent text-accent-foreground",
  ACTION_EXECUTED: "border-primary/35 bg-primary/10 text-primary",
  BUYER_REENGAGED: "border-primary/35 bg-primary/10 text-primary",
  RECOVERED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  STOPPED: "border-red-200 bg-red-50 text-red-700",
  EXPIRED: "border-border bg-muted text-muted-foreground",
};

export default async function MerchantRecoveryPage() {
  const queue = await getRecoveryQueue();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Recovery Queue
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Failed payments and abandoned checkouts that can still convert —
          bounded by stopping rules, approved by you, executed as in-app
          simulations. No real email, SMS or WhatsApp is ever sent.
        </p>
      </div>

      <div className="mb-4">
        <RecoveryQueueActions />
      </div>

      {queue.length === 0 ? (
        <Card className="border-dashed border-border shadow-none">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ClipboardList className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No open recovery cases</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Run a scan to identify failed or abandoned checkouts that are
              eligible for bounded recovery.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((recoveryCase) => (
            <Link key={recoveryCase.id} href={`/merchant/recovery/${recoveryCase.id}`}>
              <Card className="transition-colors hover:border-ring hover:bg-accent/30">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        …{recoveryCase.checkoutSessionId.slice(-8)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase ${STATUS_TONE[recoveryCase.status] ?? ""}`}
                      >
                        {recoveryCase.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium">
                      {recoveryCase.interventionType.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attempt {recoveryCase.attemptCount} · policy v{recoveryCase.policyVersion}
                      {recoveryCase.nextEligibleAt &&
                        ` · next eligible ${recoveryCase.nextEligibleAt.toLocaleTimeString("en-IN", { hour12: false })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Expected recovery</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatPaise(recoveryCase.expectedRecoveryValuePaise)}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
