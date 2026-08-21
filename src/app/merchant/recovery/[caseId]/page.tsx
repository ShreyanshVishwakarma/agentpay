import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { AuditTimeline } from "@/components/audit/audit-timeline";
import { RecoveryApproveButton } from "@/components/merchant/recovery-approve-button";
import { getRecoveryCaseDetail } from "@/lib/recovery/recovery-service";
import { getSessionEvents } from "@/lib/audit/audit-service";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Recovery Case — AgentPay",
};

export const dynamic = "force-dynamic";

export default async function RecoveryCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const recoveryCase = await getRecoveryCaseDetail(caseId);
  if (!recoveryCase) notFound();

  const session = recoveryCase.session;
  const events = await getSessionEvents(session.id);
  const intentEvent = events.find((event) => event.eventType === "INTENT_RECEIVED");
  const buyerRequest =
    (intentEvent?.payload as { sourceMessage?: string } | null)?.sourceMessage ??
    "Checkout prepared via AgentPay agent";

  const reasonCodes =
    ((recoveryCase.reasonCodes as { codes?: string[] }).codes ?? []) as string[];
  const rule = (recoveryCase.reasonCodes as { rule?: string }).rule ?? "—";
  const merchantBound =
    (recoveryCase.reasonCodes as { merchantBound?: string }).merchantBound ?? "—";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4 gap-1.5">
        <Link href="/merchant/recovery">
          <ArrowLeft className="size-3.5" />
          Back to recovery queue
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Recovery Case
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            case {recoveryCase.id}
          </p>
        </div>
        <StatusBadge status={recoveryCase.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Original buyer intent</CardTitle>
            <CardDescription>From the audited INTENT_RECEIVED event</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs italic leading-relaxed">
              “{buyerRequest}”
            </p>
            <Separator />
            <ul className="space-y-1.5">
              {session.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {item.itemName}{" "}
                    <span className="font-mono text-xs">×{item.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatPaise(item.lineTotalPaise)}</span>
                </li>
              ))}
              {session.items.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No line items — request was rejected before pricing.
                </li>
              )}
            </ul>
            <Separator />
            <div className="flex justify-between text-sm font-medium">
              <span>Cart value</span>
              <span className="tabular-nums">
                {session.totalPaise > 0
                  ? formatPaise(session.totalPaise)
                  : formatPaise(
                      (session.rejectionDetails as { attemptedTotalPaise?: number })
                        ?.attemptedTotalPaise ?? 0,
                    )}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Session state</span>
              <StatusBadge status={session.status} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Policy &amp; risk context</CardTitle>
            <CardDescription>
              Deterministic decision — policy v{recoveryCase.policyVersion}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Failure / abandonment reason</p>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {session.rejectionReason ?? session.status}
              </code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recommended intervention</p>
              <p className="font-mono text-[11px] font-medium text-indigo-700">
                {recoveryCase.interventionType}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rule that generated it</p>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{rule}</code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Merchant control bounding it</p>
              <p className="text-xs leading-relaxed">{merchantBound}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reason codes</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {reasonCodes.map((code) => (
                  <Badge key={code} variant="outline" className="text-[10px]">
                    {code}
                  </Badge>
                ))}
              </div>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-medium">
              <span>Expected recovery value</span>
              <span className="tabular-nums text-emerald-700">
                {formatPaise(recoveryCase.expectedRecoveryValuePaise)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Attempts used</span>
              <span>{recoveryCase.attemptCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 border-indigo-200 bg-indigo-50/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Merchant action</CardTitle>
          <CardDescription>
            Approving executes a simulated in-app recovery — no real message is
            sent and no payment is initiated. The buyer must still complete a
            fully gated checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recoveryCase.status === "STOPPED" ? (
            <p className="flex items-center gap-2 text-sm text-red-700">
              <Ban className="size-4" />
              This case is stopped ({recoveryCase.stoppedReason}) and cannot be resumed.
            </p>
          ) : recoveryCase.status === "RECOVERED" ? (
            <p className="text-sm text-emerald-700">
              Recovered {formatPaise(recoveryCase.actualRecoveredValuePaise ?? 0)} — this case is complete.
            </p>
          ) : recoveryCase.status === "EXPIRED" ? (
            <p className="text-sm text-muted-foreground">This case expired without buyer action.</p>
          ) : (
            <RecoveryApproveButton caseId={recoveryCase.id} />
          )}
          {(recoveryCase.status === "ACTION_EXECUTED" ||
            recoveryCase.status === "BUYER_REENGAGED") && (
            <p className="mt-3 text-xs text-muted-foreground">
              Buyer-facing page:{" "}
              <Link
                href={`/recover/${recoveryCase.id}`}
                className="font-medium text-indigo-700 hover:underline"
              >
                /recover/{recoveryCase.id.slice(-8)}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="size-4 text-primary" />
            Full audit timeline
          </CardTitle>
          <CardDescription>
            Every event in this session&apos;s tamper-evident chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditTimeline
            events={events.map((event) => ({
              id: event.id,
              eventType: event.eventType,
              actor: event.actor,
              payload: event.payload,
              previousHash: event.previousHash,
              eventHash: event.eventHash,
              createdAt: event.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
