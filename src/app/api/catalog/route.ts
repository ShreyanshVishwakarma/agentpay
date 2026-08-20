import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPolicyConfig } from "@/lib/checkout/policy-engine";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog
 * Agent-readable catalog. Prices are served exclusively by this server —
 * AI buyers must use these SKUs and prices; nothing else is trusted.
 */
export async function GET() {
  try {
    const [items, policy] = await Promise.all([
      db.catalogItem.findMany({
        where: { active: true },
        orderBy: { pricePaise: "asc" },
      }),
      getPolicyConfig(),
    ]);

    return NextResponse.json({
      merchant: policy.merchantName,
      currency: "INR",
      maxItemsPerOrder: policy.maxItemsPerOrder,
      items: items.map((item) => ({
        sku: item.sku,
        name: item.name,
        description: item.description,
        pricePaise: item.pricePaise,
        formattedPrice: formatPaise(item.pricePaise),
        availability: item.stock > 0 ? "in_stock" : "out_of_stock",
        maxQuantity: Math.min(item.stock, policy.maxItemsPerOrder),
      })),
    });
  } catch (error) {
    console.error("[api/catalog]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not load the catalog." } },
      { status: 500 },
    );
  }
}
