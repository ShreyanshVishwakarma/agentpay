"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const BUYER_NAV = [{ href: "/buy", label: "Agent Checkout" }];

const MERCHANT_NAV = [
  { href: "/merchant", label: "Overview" },
  { href: "/merchant/catalog", label: "Catalog" },
  { href: "/merchant/policies", label: "Policy Studio" },
  { href: "/merchant/insights", label: "Revenue" },
  { href: "/merchant/recovery", label: "Recovery" },
  { href: "/merchant/audit", label: "Audit Trail" },
  { href: "/architecture", label: "Architecture" },
];

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
            AgentPay
          </span>
          <Badge
            variant="outline"
            className="hidden border-amber-300 bg-amber-50 text-[10px] font-medium uppercase tracking-wide text-amber-700 md:inline-flex"
          >
            Test Mode
          </Badge>
        </Link>

        <nav className="flex items-center gap-0.5 overflow-x-auto">
          <span className="mr-1 hidden text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70 lg:inline">
            Buyer
          </span>
          {BUYER_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
          <span className="mx-1 hidden h-4 w-px bg-border lg:inline-block" />
          <span className="mr-1 hidden text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70 lg:inline">
            Merchant
          </span>
          {MERCHANT_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
      </div>
    </header>
  );
}
