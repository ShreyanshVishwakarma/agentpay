import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ConversionFunnel,
  InsightsSummaryCards,
  OpportunitiesTable,
  ProtectionCard,
  WhyThisMattersPanel,
} from "@/components/merchant/insight-cards";
import { computeInsights, getOpportunityRows } from "@/lib/insights/metrics";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Revenue Opportunities — AgentPay",
};

export const dynamic = "force-dynamic";

export default async function MerchantInsightsPage() {
  const [insights, opportunities] = await Promise.all([
    computeInsights(),
    getOpportunityRows(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Agentic Revenue Opportunities
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Safe agentic commerce is a growth channel: see where intent
            converts, where policy prevented losses, and which failed checkouts
            can be recovered within merchant rules.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/merchant/recovery">
              Recovery queue
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
          <Badge variant="outline" className="gap-1 border-border bg-muted text-[10px] uppercase text-muted-foreground">
            <RefreshCw className="size-3" />
            Synthetic demo data
          </Badge>
        </div>
      </div>

      <InsightsSummaryCards insights={insights} />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Conversion funnel</CardTitle>
            <CardDescription>Count, value and drop-off per stage.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionFunnel funnel={insights.funnel} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <ProtectionCard protectedPaise={insights.revenueProtectedPaise} />
          <WhyThisMattersPanel />
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-primary" />
                Top blocked reasons
              </CardTitle>
              <CardDescription>Deterministic policy outcomes — never LLM judgment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {insights.topBlockedReasons.map((reason) => (
                <div key={reason.reason} className="flex items-center justify-between text-sm">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {reason.reason}
                  </code>
                  <span className="tabular-nums text-muted-foreground">
                    {reason.count} blocked · {formatPaise(reason.valuePaise)} prevented
                  </span>
                </div>
              ))}
              {insights.topBlockedReasons.length === 0 && (
                <p className="text-xs text-muted-foreground">No rejections recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Revenue opportunities</h2>
        <OpportunitiesTable rows={opportunities} showCaseLink={false} />
      </div>
    </div>
  );
}
