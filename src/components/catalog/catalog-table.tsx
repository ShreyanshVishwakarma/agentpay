import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPaise } from "@/lib/money";

export interface CatalogRow {
  sku: string;
  name: string;
  description: string;
  pricePaise: number;
  stock: number;
  active: boolean;
}

export function CatalogTable({ items }: { items: CatalogRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-44">SKU</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="w-24 text-right">Stock</TableHead>
            <TableHead className="w-28 text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.sku}>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {item.sku}
              </TableCell>
              <TableCell>
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatPaise(item.pricePaise)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {item.stock}
              </TableCell>
              <TableCell className="text-center">
                {!item.active ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                    Inactive
                  </Badge>
                ) : item.stock > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700"
                  >
                    Available
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-red-200 bg-red-50 text-red-700"
                  >
                    Sold out
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
