import type { Metadata } from "next";
import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CatalogTable } from "@/components/catalog/catalog-table";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/lib/db";
import { getPolicyConfig } from "@/lib/checkout/policy-engine";

export const metadata: Metadata = {
  title: "Merchant Catalog — AgentPay",
};

export const dynamic = "force-dynamic";

export default async function MerchantCatalogPage() {
  const [items, policy] = await Promise.all([
    db.catalogItem.findMany({ orderBy: { pricePaise: "asc" } }),
    getPolicyConfig(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        kicker="Merchant console · catalog"
        title={policy.merchantName}
        description="The single source of truth for prices and stock. AI agents must use these SKUs and server-provided prices — client-supplied values are never trusted."
        actions={
          <Button asChild variant="outline" className="gap-2">
            <a href="/api/catalog" target="_blank" rel="noopener noreferrer">
              Open raw catalog JSON
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        }
      />

      <Card className="mb-6 border-primary/25 bg-accent/50">
        <CardContent className="flex items-start gap-2.5 pt-6 text-sm text-accent-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Agent-readable endpoint</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              Agents discover this catalog at{" "}
              <code className="rounded bg-card px-1 py-0.5 font-mono text-[11px]">
                GET /api/catalog
              </code>{" "}
              — it returns SKUs, descriptions, integer paise prices, formatted
              rupee amounts, availability and per-order quantity caps. The
              policy engine recalculates every total from these database prices
              at preview <em>and</em> confirmation time.
            </p>
          </div>
        </CardContent>
      </Card>

      <CatalogTable
        items={items.map((item) => ({
          sku: item.sku,
          name: item.name,
          description: item.description,
          pricePaise: item.pricePaise,
          stock: item.stock,
          active: item.active,
        }))}
      />

      <p className="mt-4 text-xs text-muted-foreground">
        Per-order limits: max {policy.maxItemsPerOrder} units · max order value{" "}
        {(policy.maxOrderPaise / 100).toLocaleString("en-IN", {
          style: "currency",
          currency: "INR",
        })}{" "}
        · explicit buyer confirmation required.
      </p>
    </div>
  );
}
