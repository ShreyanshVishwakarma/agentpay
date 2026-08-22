import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Audit Trail — AgentPay",
};

export const dynamic = "force-dynamic";

export default async function MerchantAuditPage() {
  const sessions = await db.checkoutSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: {
      id: true,
      status: true,
      totalPaise: true,
      rejectionReason: true,
      updatedAt: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        kicker="Merchant console · audit"
        title="Audit trail"
        description="Every checkout session has a tamper-evident, hash-chained event history. Open any session to verify its chain."
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="size-4 text-primary" />
            Recent sessions
          </CardTitle>
          <CardDescription>Newest first · newest 25 shown</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/audit/${session.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-accent/40"
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                …{session.id.slice(-8)}
              </span>
              <span className="text-xs text-muted-foreground">
                {session.updatedAt.toLocaleString("en-IN", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              {session.rejectionReason && (
                <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-700">
                  {session.rejectionReason}
                </code>
              )}
              <span className="ml-auto flex items-center gap-2">
                <span className="text-xs tabular-nums">{formatPaise(session.totalPaise)}</span>
                <StatusBadge status={session.status} />
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
