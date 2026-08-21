import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RecoveryBuyerActions } from "@/components/merchant/recovery-buyer-actions";
import { getRecoveryCaseDetail } from "@/lib/recovery/recovery-service";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Recover your checkout — AgentPay",
};

export const dynamic = "force-dynamic";

export default async function BuyerRecoveryPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const recoveryCase = await getRecoveryCaseDetail(caseId);
  if (!recoveryCase) notFound();

  const session = recoveryCase.session;
  const lastAction = recoveryCase.actions[0];
  const message =
    lastAction?.messagePreview ??
    "Your checkout was not completed. You can safely resume whenever you're ready.";

  const canResume =
    (session.status === "AWAITING_CONFIRMATION" || session.status === "ORDER_CREATED") &&
    recoveryCase.status !== "STOPPED" &&
    recoveryCase.status !== "RECOVERED" &&
    recoveryCase.status !== "EXPIRED";

  const hasAlternative =
    recoveryCase.interventionType === "OFFER_LOWER_PRICED_ALTERNATIVE" &&
    canResume;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" />
        Simulated recovery page — {`no real message was ever sent`}
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">A note about your checkout</CardTitle>
          <CardDescription>From the SkillForge Learning team</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm leading-relaxed">
            “{message}”
          </p>

          <Separator />

          <div className="space-y-1.5 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your original cart
            </p>
            {session.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {item.itemName}{" "}
                  <span className="font-mono text-xs">×{item.quantity}</span>
                </span>
                <span className="tabular-nums">{formatPaise(item.lineTotalPaise)}</span>
              </div>
            ))}
            {session.items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Original request could not be priced.
              </p>
            )}
          </div>

          {(canResume || hasAlternative) && (
            <>
              <Separator />
              <RecoveryBuyerActions
                caseId={recoveryCase.id}
                resumeHref={`/buy?resume=${session.id}`}
                canResume={canResume}
                hasAlternative={hasAlternative}
              />
            </>
          )}

          {recoveryCase.status === "RECOVERED" && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              This checkout was completed and verified. Thank you!
            </p>
          )}
          {recoveryCase.status === "STOPPED" && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              This recovery offer was declined and is now closed.
            </p>
          )}

          <Separator />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Nothing has been charged. Any resumed checkout re-runs merchant
            policy checks, requires your explicit confirmation, creates a
            Razorpay test-mode order, and is verified server-side before
            fulfilment.{" "}
            <Link href="/buy" className="font-medium text-indigo-700 hover:underline">
              Start a new request instead
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <div className="mt-4 text-center">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← AgentPay home</Link>
        </Button>
      </div>
    </div>
  );
}
