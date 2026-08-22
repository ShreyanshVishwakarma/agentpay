import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { AuditIntegrityCard } from "@/components/audit/audit-integrity-card";
import { db } from "@/lib/db";
import { verifySessionChain } from "@/lib/audit/audit-service";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Audit Trail — AgentPay",
};

export const dynamic = "force-dynamic";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    include: { items: true },
  });

  if (!session) {
    notFound();
  }

  const events = await db.auditEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  const chain = await verifySessionChain(sessionId);

  const rejected = session.status === "REJECTED";
  const orderCreated = session.razorpayOrderId !== null;
  const verified = session.status === "PAYMENT_VERIFIED";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 -ml-2">
        <Link href="/buy">
          <ArrowLeft className="size-3.5" />
          Back to agent checkout
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span aria-hidden className="size-1 rounded-full bg-primary" />
            Audit · session
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tighter text-foreground">
            Session trail
          </h1>
          <p className="mt-1.5 font-mono text-xs text-muted-foreground">
            {session.id}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {rejected && (
        <Card className="mb-4 border-red-200 bg-red-50/60">
          <CardContent className="flex items-start gap-2.5 pt-6 text-sm text-red-800">
            <Ban className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">No Razorpay order was created.</p>
              <p className="mt-0.5 text-xs">
                The policy engine rejected this request before any payment
                action ({session.rejectionReason}). No charge was made.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Cart summary</CardTitle>
            <CardDescription>Server-calculated from catalog prices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1.5">
              {session.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {item.itemName}{" "}
                    <span className="font-mono text-xs">×{item.quantity}</span>
                  </span>
                  <span className="tabular-nums">
                    {formatPaise(item.lineTotalPaise)}
                  </span>
                </li>
              ))}
              {session.items.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No line items (rejected before pricing).
                </li>
              )}
            </ul>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatPaise(session.totalPaise)}</span>
            </div>
            {session.buyerBudgetPaise !== null && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Buyer budget</span>
                <span className="tabular-nums">
                  {formatPaise(session.buyerBudgetPaise)} ·{" "}
                  <span className="text-emerald-700">
                    {formatPaise(session.buyerBudgetPaise - session.totalPaise)} left
                  </span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CreditCard className="size-4 text-primary" />
              Payment details
            </CardTitle>
            <CardDescription>Test mode — no real money moves</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Razorpay Order ID</p>
              <p className="font-mono text-xs">
                {orderCreated ? (
                  session.razorpayOrderId
                ) : (
                  <span className="text-muted-foreground">
                    None — no order was created for this session.
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Razorpay Payment ID</p>
              <p className="font-mono text-xs">
                {verified && session.razorpayPaymentId ? (
                  session.razorpayPaymentId
                ) : (
                  <span className="text-muted-foreground">
                    Hidden — shown only after signature verification.
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Decision</p>
              <p className="text-xs leading-relaxed">
                {verified &&
                  "Signature verified server-side; stock decremented atomically."}
                {rejected &&
                  `Rejected by deterministic policy (${session.rejectionReason}) — the AI cannot overrule this.`}
                {!verified && !rejected &&
                  (orderCreated
                    ? "Order created after explicit buyer confirmation; awaiting verified payment."
                    : "Awaiting policy evaluation.")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <AuditIntegrityCard sessionId={session.id} initial={chain} />
      </div>

      <Card className="mt-4 border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm">Event timeline</CardTitle>
          <CardDescription>
            {events.length} event{events.length === 1 ? "" : "s"} · newest hash
            links to its predecessor · click a hash to copy the full value
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
