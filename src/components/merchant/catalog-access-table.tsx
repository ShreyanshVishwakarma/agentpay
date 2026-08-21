"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, EyeOff, ShoppingCart, ScanEye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface CatalogAccessRow {
  sku: string;
  name: string;
  pricePaise: number;
  stock: number;
  agentDiscoverable: boolean;
  agentPurchasable: boolean;
  paused: boolean;
  maxAgentQuantity: number | null;
}

type AccessField = "agentDiscoverable" | "agentPurchasable" | "paused";

const FIELD_META: Record<AccessField, { label: string; icon: typeof ScanEye }> = {
  agentDiscoverable: { label: "Discoverable by AI", icon: ScanEye },
  agentPurchasable: { label: "Purchasable by AI", icon: ShoppingCart },
  paused: { label: "Temporarily paused", icon: PauseCircle },
};

export function CatalogAccessTable({ items }: { items: CatalogAccessRow[] }) {
  const router = useRouter();
  const [busySku, setBusySku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(sku: string, field: AccessField, value: boolean) {
    setBusySku(sku);
    setError(null);
    try {
      const response = await fetch("/api/merchant/catalog-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, [field]: value }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: { message: string } };
        setError(data.error?.message ?? "Update failed.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusySku(null);
    }
  }

  async function updateCap(sku: string, raw: string) {
    const cap = raw === "" ? null : Number.parseInt(raw, 10);
    if (raw !== "" && (!Number.isInteger(cap) || (cap ?? 0) < 1)) return;
    setBusySku(sku);
    try {
      await fetch("/api/merchant/catalog-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, maxAgentQuantity: cap }),
      });
      router.refresh();
    } finally {
      setBusySku(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Product</TableHead>
              {(Object.keys(FIELD_META) as AccessField[]).map((field) => (
                <TableHead key={field} className="text-center">
                  <span className="inline-flex items-center gap-1">
                    {(() => {
                      const Icon = FIELD_META[field].icon;
                      return <Icon className="size-3.5" />;
                    })()}
                    {FIELD_META[field].label}
                  </span>
                </TableHead>
              ))}
              <TableHead className="text-center">AI qty cap</TableHead>
              <TableHead className="text-center">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.sku}>
                <TableCell>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{item.sku}</p>
                </TableCell>
                {(Object.keys(FIELD_META) as AccessField[]).map((field) => (
                  <TableCell key={field} className="text-center">
                    <Switch
                      checked={item[field]}
                      disabled={busySku === item.sku}
                      onCheckedChange={(checked) => update(item.sku, field, checked)}
                      aria-label={`${FIELD_META[field].label} for ${item.name}`}
                    />
                  </TableCell>
                ))}
                <TableCell className="text-center">
                  <Input
                    className="mx-auto h-8 w-16 text-center"
                    inputMode="numeric"
                    placeholder="—"
                    defaultValue={item.maxAgentQuantity?.toString() ?? ""}
                    disabled={busySku === item.sku}
                    onBlur={(event) => {
                      if (event.target.value !== (item.maxAgentQuantity?.toString() ?? "")) {
                        void updateCap(item.sku, event.target.value);
                      }
                    }}
                  />
                </TableCell>
                <TableCell className="text-center">
                  {item.paused ? (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      Paused
                    </Badge>
                  ) : !item.agentPurchasable ? (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                      Human-only
                    </Badge>
                  ) : item.stock > 0 ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Live for AI
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      Sold out
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <EyeOff className="size-3.5" />
        Products hidden from AI discovery are excluded from the agent-readable
        catalog endpoint immediately.
      </p>
    </div>
  );
}
