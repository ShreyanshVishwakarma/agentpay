import Link from "next/link";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="ambient-pools flex min-h-[60vh] items-center">
      <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-card shadow-card-tinted ring-1 ring-foreground/[0.06]">
          <ShieldQuestion className="size-6 text-primary" />
        </span>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          404 · page not found
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
          This route never made it past policy.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you asked for doesn&apos;t exist. Nothing was charged,
          ordered, or audited — your session is safe.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild className="gap-2">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/buy">Open agent checkout</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
