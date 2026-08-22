"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { PreviewApproved } from "@/components/agent/types";
import { formatPaise } from "@/lib/money";

export function CheckoutPreview({
  preview,
  onConfirm,
  confirming,
  onAddAddOn,
  addOnBusySku,
  compact = false,
}: {
  preview: PreviewApproved;
  onConfirm: () => void;
  confirming: boolean;
  onAddAddOn?: (sku: string) => void;
  addOnBusySku?: string | null;
  /** Slim variant used inside the checkout popup. */
  compact?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const addOns = (preview.recommendedAddOns ?? []).filter(
    (addOn) => !preview.items.some((item) => item.sku === addOn.sku),
  );

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {preview.items.map((item) => (
            <div
              key={item.sku}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{item.itemName}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {item.sku} · {item.formattedUnitPrice} × {item.quantity}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
                {item.formattedLineTotal}
              </span>
            </div>
          ))}
        </div>

        {addOns.length > 0 && onAddAddOn && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Agent suggestions
            </p>
            {addOns.map((addOn) => (
              <div
                key={addOn.sku}
                className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-accent/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {addOn.name}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      +{addOn.formattedPrice}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground" title={addOn.bound}>
                    {addOn.reason} · {addOn.bound}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={confirming || addOnBusySku === addOn.sku}
                  onClick={() => onAddAddOn(addOn.sku)}
                >
                  {addOnBusySku === addOn.sku ? "Checking…" : "+ Add"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <Separator />

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums text-foreground">
              {preview.formattedTotal}
            </span>
          </div>
          {preview.remainingBudgetPaise !== null && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Remaining budget</span>
              <span className="tabular-nums text-emerald-700">
                {formatPaise(preview.remainingBudgetPaise)}
              </span>
            </div>
          )}
        </div>

        <Button className="w-full gap-2" disabled={confirming} onClick={onConfirm}>
          {confirming ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating secure checkout…
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" />
              Confirm &amp; open test payment
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          No payment action occurs until you explicitly confirm.
        </p>
      </div>
    );
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShoppingCart className="size-4 text-primary" />
            Checkout preview
          </CardTitle>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            Awaiting your confirmation
          </span>
        </div>
        <CardDescription>
          Prices are calculated server-side from the merchant catalog.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {preview.items.map((item) => (
            <div
              key={item.sku}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {item.itemName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {item.sku} · {item.formattedUnitPrice} × {item.quantity}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
                {item.formattedLineTotal}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        {addOns.length > 0 && onAddAddOn && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Frequently paired — agent suggestions (bounded by policy)
            </p>
            {addOns.map((addOn) => (
              <div
                key={addOn.sku}
                  className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-accent/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {addOn.name}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      +{addOn.formattedPrice}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground" title={addOn.bound}>
                    {addOn.reason} · {addOn.bound}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={confirming || addOnBusySku === addOn.sku}
                  onClick={() => onAddAddOn(addOn.sku)}
                >
                  {addOnBusySku === addOn.sku ? "Checking…" : "+ Add"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {addOns.length > 0 && <Separator />}

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums text-foreground">
              {preview.formattedTotal}
            </span>
          </div>
          {preview.budgetPaise !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Your budget</span>
              <span className="tabular-nums text-foreground">
                {formatPaise(preview.budgetPaise)}
              </span>
            </div>
          )}
          {preview.remainingBudgetPaise !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Remaining budget</span>
              <span className="tabular-nums text-emerald-700">
                {formatPaise(preview.remainingBudgetPaise)}
              </span>
            </div>
          )}
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button className="w-full gap-2" disabled={confirming}>
              {confirming ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating secure checkout…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Create test checkout
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm this purchase?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    You are about to create a Razorpay{" "}
                    <span className="font-medium">test-mode</span> order for{" "}
                    <span className="font-semibold text-foreground">
                      {preview.formattedTotal}
                    </span>
                    .
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-left">
                    {preview.items.map((item) => (
                      <li key={item.sku}>
                        {item.itemName} × {item.quantity}
                      </li>
                    ))}
                  </ul>
                  <p className="pt-1 text-xs">
                    No payment action occurs until you explicitly confirm. This
                    demo never charges real money.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirming}
                onClick={(event) => {
                  event.preventDefault();
                  setDialogOpen(false);
                  onConfirm();
                }}
              >
                Create test checkout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-center text-xs text-muted-foreground">
          No payment action occurs until you explicitly confirm.
        </p>
      </CardContent>
    </Card>
  );
}
