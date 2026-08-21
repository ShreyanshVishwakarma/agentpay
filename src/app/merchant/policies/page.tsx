import type { Metadata } from "next";
import { History, ScrollText, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PolicyStudio } from "@/components/merchant/policy-studio";
import { PolicySimulator } from "@/components/merchant/policy-simulator";
import { CatalogAccessTable } from "@/components/merchant/catalog-access-table";
import { getPolicyConfig } from "@/lib/checkout/policy-engine";
import { listPolicyVersions } from "@/lib/policy/policy-service";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Policy Studio — AgentPay",
};

export const dynamic = "force-dynamic";

export default async function MerchantPoliciesPage() {
  const [policy, versions, catalog] = await Promise.all([
    getPolicyConfig(),
    listPolicyVersions(),
    db.catalogItem.findMany({ orderBy: { pricePaise: "asc" } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Policy Studio
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Machine-enforceable rules for AI commerce. Every save creates a new
          immutable policy version and appends a POLICY_CHANGED event to the
          merchant audit chain — historical checkouts are never re-evaluated.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <PolicyStudio policy={policy} />

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Catalog access controls</CardTitle>
              <CardDescription>
                Decide what AI agents may see and buy, product by product.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CatalogAccessTable
                items={catalog.map((item) => ({
                  sku: item.sku,
                  name: item.name,
                  pricePaise: item.pricePaise,
                  stock: item.stock,
                  agentDiscoverable: item.agentDiscoverable,
                  agentPurchasable: item.agentPurchasable,
                  paused: item.paused,
                  maxAgentQuantity: item.maxAgentQuantity,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <PolicySimulator
            scenarios={[
              { key: "two-sql-under-800", label: "Buy 2 SQL packs under ₹800", description: "" },
              { key: "three-sql-under-800", label: "Buy 3 SQL packs under ₹800", description: "" },
              { key: "sold-out-bundle", label: "Buy sold-out Premium Bundle", description: "" },
              { key: "six-items", label: "Buy 6 items", description: "" },
              { key: "paused-product", label: "Checkout after product is paused", description: "" },
            ]}
          />

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="size-4 text-primary" />
                Policy version history
              </CardTitle>
              <CardDescription>Older versions stay queryable forever.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">v{version.policyVersion}</span>
                    {version.supersededAt === null ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Active
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        superseded
                      </span>
                    )}
                  </div>
                  {version.changeNote && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {version.changeNote}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    max order {formatPaise(version.maxOrderPaise)} · items ≤{" "}
                    {version.maxItemsPerOrder} · by {version.changedBy}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ScrollText className="size-4 text-slate-600" />
                How enforcement works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-indigo-600" />
                Checkout preview and confirmation always evaluate the{" "}
                <span className="font-medium text-foreground">latest</span>{" "}
                policy version against live inventory and database prices.
              </p>
              <p className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-indigo-600" />
                Rejections carry a machine-readable code plus the exact control
                responsible (e.g.{" "}
                <code className="rounded bg-white/70 px-1 font-mono text-[10px]">
                  catalog_access.paused
                </code>
                ).
              </p>
              <p className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-indigo-600" />
                The LLM can read these limits through the catalog endpoint but
                can never change them or argue with them.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
