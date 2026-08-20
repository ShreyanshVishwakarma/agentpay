import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-600",
  AWAITING_CONFIRMATION: "border-amber-200 bg-amber-50 text-amber-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  ORDER_CREATED: "border-indigo-200 bg-indigo-50 text-indigo-700",
  PAYMENT_PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  PAYMENT_VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAYMENT_FAILED: "border-red-200 bg-red-50 text-red-700",
  EXPIRED: "border-slate-200 bg-slate-50 text-slate-500",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
