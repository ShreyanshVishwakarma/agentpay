import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  ScrollText,
  Settings2,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ConversionFunnel,
  InsightsSummaryCards,
  OpportunitiesTable,
  ProtectionCard,
} from "@/components/merchant/insight-cards";
import { computeInsights, getOpportunityRows } from "@/lib/insights/metrics";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Merchant Overview — AgentPay",
};

export const dynamic = "force-dynamic";

const CONSOLE_LINKS = [
  { href: "/merchant/catalog", label: "Catalog", icon: ShoppingCart },
  { href: "/merchant/policies", label: "Policy Studio", icon: Settings2 },
  { href: "/merchant/insights", label: "Revenue Opportunities", icon: TrendingUp },
  { href: "/merchant/recovery", label: "Recovery Queue", icon: ClipboardList },
];

export default async function MerchantOverviewPage() {
  const [insights, opportunities, recentSessions] = await Promise.all([
    computeInsights(),
    getOpportunityRows(),
    db.checkoutSession.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, status: true, totalPaise: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Merchant Overview
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            SkillForge Learning · the control plane for safe AI commerce.
            Agents can discover and propose — your policies decide what money
            can move.
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/buy">
            Open agent checkout
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {CONSOLE_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="transition-colors hover:border-indigo-300 hover:bg-accent/40">
              <CardContent className="flex items-center gap-2.5 pt-5">
                <link.icon className="size-4 text-primary" />
                <span className="text-sm font-medium">{link.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <InsightsSummaryCards insights={insights} />

      <div className="mt-4">
        <ProtectionCard protectedPaise={insights.revenueProtectedPaise} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Conversion funnel</CardTitle>
            <CardDescription>Intent → verified payment.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionFunnel funnel={insights.funnel} />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Recent checkout sessions</span>
              <Link
                href="/merchant/audit"
                className="inline-flex items-center gap-1 text-xs font-normal text-indigo-700 hover:underline"
              >
                <ScrollText className="size-3.5" />
                Full audit trail
              </Link>
            </CardTitle>
            <CardDescription>Newest first — every session fully auditable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recentSessions.map((session) => (
              <Link
                key={session.id}
                href={`/audit/${session.id}`}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-accent/40"
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  …{session.id.slice(-8)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs tabular-nums">
                    {formatPaise(session.totalPaise)}
                  </span>
                  <StatusBadge status={session.status} />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Top recovery opportunities</h2>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/merchant/recovery">
              Open recovery queue
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        <OpportunitiesTable rows={opportunities.slice(0, 5)} showCaseLink={false} />
      </div>
    </div>
  );
}
