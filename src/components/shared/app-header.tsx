"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

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
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-md px-2.5 py-1.5 text-[13px] transition-all duration-200 active:translate-y-px",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-2.5 -bottom-[9px] h-0.5 rounded-full bg-primary"
        />
      )}
    </Link>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 rounded-md transition-colors"
        >
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary text-primary-foreground shadow-card-tinted transition-transform duration-300 group-hover:-rotate-6">
            <ShieldCheck className="size-4" />
          </span>
          <span className="hidden font-display text-sm font-semibold tracking-tight text-foreground sm:inline">
            AgentPay
          </span>
          <span className="hidden items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-amber-700 md:inline-flex dark:text-amber-400">
            <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
            Test mode
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 overflow-x-auto">
          <span className="mr-1 hidden text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 lg:inline">
            Buyer
          </span>
          {BUYER_NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
          <span className="mx-1 hidden h-4 w-px bg-border lg:inline-block" />
          <span className="mr-1 hidden text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 lg:inline">
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
