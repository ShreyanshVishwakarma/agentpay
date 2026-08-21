import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CircleDollarSign,
  HeartPulse,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatPaise } from "@/lib/money";
import type { FunnelStage, OpportunityRow, InsightsSnapshot } from "@/lib/insights/metrics";

export function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "green" | "red" | "amber" | "indigo";
}) {
  const toneClass = {
    neutral: "text-foreground",
    green: "text-emerald-700",
    red: "text-red-700",
    amber: "text-amber-700",
    indigo: "text-primary",
  }[tone];

  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="pt-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function ConversionFunnel({ funnel }: { funnel: FunnelStage[] }) {
  const max = Math.max(...funnel.map((stage) => stage.count), 1);

  return (
    <div className="space-y-3">
      {funnel.map((stage, index) => (
        <div key={stage.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">{stage.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {stage.count}
              {stage.valuePaise > 0 && ` · ${formatPaise(stage.valuePaise)}`}
            </span>
          </div>
          <div className="mt-1 h-6 overflow-hidden rounded-md bg-muted/70">
            <div
              className="flex h-full items-center justify-end rounded-md bg-primary/80 pr-2"
              style={{ width: `${Math.max(4, (stage.count / max) * 100)}%` }}
            >
              {stage.conversionFromPrevious !== null && (
                <span className="text-[10px] font-medium text-primary-foreground">
                  {Math.round(stage.conversionFromPrevious * 100)}%
                </span>
              )}
            </div>
          </div>
          {stage.dropOffFromPrevious !== null && stage.dropOffFromPrevious > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              ↓ {stage.dropOffFromPrevious} dropped from previous stage
            </p>
          )}
          {index === funnel.length - 1 && null}
        </div>
      ))}
    </div>
  );
}

export function OpportunitiesTable({
  rows,
  showCaseLink = true,
}: {
  rows: OpportunityRow[];
  showCaseLink?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No open revenue opportunities right now.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Session</th>
            <th className="px-3 py-2.5 font-medium">Buyer request</th>
            <th className="px-3 py-2.5 text-right font-medium">Value</th>
            <th className="px-3 py-2.5 font-medium">Opportunity</th>
            <th className="px-3 py-2.5 font-medium">Recommended intervention</th>
            <th className="px-3 py-2.5 text-right font-medium">Expected recovery</th>
            <th className="px-3 py-2.5 text-right font-medium">Confidence</th>
            <th className="px-3 py-2.5 font-medium">Allowed action</th>
            <th className="px-3 py-2.5 font-medium">Audit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sessionId} className="border-b last:border-0 align-top">
              <td className="px-3 py-2.5">
                <Link
                  href={`/audit/${row.sessionId}`}
                  className="font-mono text-[11px] text-primary hover:underline"
                >
                  {row.sessionId.slice(-10)}
                </Link>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{row.state}</p>
              </td>
              <td className="max-w-[180px] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {row.buyerRequestSummary}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatPaise(row.cartValuePaise)}
              </td>
              <td className="px-3 py-2.5 text-xs">{row.opportunityType}</td>
              <td className="max-w-[220px] px-3 py-2.5 text-xs leading-relaxed">
                <span className="font-mono text-[10px] font-medium text-primary">
                  {row.interventionType}
                </span>
                <p className="mt-0.5 text-muted-foreground">{row.recommendedIntervention}</p>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {row.expectedRecoveryValuePaise > 0
                  ? formatPaise(row.expectedRecoveryValuePaise)
                  : "—"}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {Math.round(row.confidence * 100)}%
              </td>
              <td className="px-3 py-2.5 text-xs">{row.allowedAction}</td>
              <td className="px-3 py-2.5">
                {showCaseLink ? (
                  row.hasCase ? (
                    <Link
                      href={`/merchant/recovery`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      case <ArrowRight className="size-3" />
                    </Link>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">no case yet</span>
                  )
                ) : (
                  <Link
                    href={`/audit/${row.sessionId}`}
                    className="text-xs text-primary hover:underline"
                  >
                    view
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WhyThisMattersPanel() {
  return (
    <Card className="border-primary/25 bg-accent/50 shadow-sm">
      <CardContent className="flex items-start gap-2.5 pt-6">
        <HeartPulse className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="text-sm leading-relaxed text-accent-foreground">
          <p className="font-medium">Why this matters</p>
          <p className="mt-1 text-xs">
            AgentPay does not optimize for more payment attempts. It helps
            merchants convert eligible intent while preventing unsafe,
            duplicate, or non-compliant money actions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function InsightsSummaryCards({ insights }: { insights: InsightsSnapshot }) {
  const icons = {
    proposals: ShoppingCart,
    confirmed: UserCheck,
    verified: BadgeCheck,
    rejected: Ban,
  };
  void icons;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Agent-attributed checkout proposals"
        value={insights.proposals.toString()}
        sub="Carts previewed from agent intent"
        tone="indigo"
      />
      <MetricCard
        label="Buyer-confirmed checkouts"
        value={insights.confirmedCheckouts.toString()}
        sub="Explicit human approval given"
        tone="indigo"
      />
      <MetricCard
        label="Verified payments"
        value={insights.verifiedPayments.toString()}
        sub="Signature or webhook verified"
        tone="green"
      />
      <MetricCard
        label="Rejected unsafe requests"
        value={insights.rejectedUnsafeRequests.toString()}
        sub="Blocked before any payment action"
        tone="red"
      />
      <MetricCard
        label="Revenue verified"
        value={formatPaise(insights.revenueVerifiedPaise)}
        sub="PAYMENT_VERIFIED session totals"
        tone="green"
      />
      <MetricCard
        label="Revenue protected"
        value={formatPaise(insights.revenueProtectedPaise)}
        sub="Out-of-policy attempts prevented"
        tone="amber"
      />
      <MetricCard
        label="Revenue at risk"
        value={formatPaise(insights.revenueAtRiskPaise)}
        sub="Failed / expired / abandoned checkouts"
        tone="red"
      />
      <MetricCard
        label="Recovery conversion rate"
        value={`${Math.round(insights.recoveryConversionRate * 100)}%`}
        sub={`${insights.recoveryRecoveredCount} recovered of ${insights.recoveryEligibleCount} eligible cases`}
        tone="indigo"
      />
    </div>
  );
}

export function ProtectionCard({ protectedPaise }: { protectedPaise: number }) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
      <CardContent className="flex items-start gap-2.5 pt-6">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <div className="text-sm text-emerald-900">
          <p className="font-medium">Today&apos;s policy protection</p>
          <p className="mt-0.5 text-xs">
            {formatPaise(protectedPaise)} protected from out-of-policy checkout
            attempts — budget breaches, sold-out items, quantity caps and
            paused products never reached a payment screen.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CircleDollarIcon() {
  return <CircleDollarSign className="size-4" />;
}
