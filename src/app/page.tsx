import Link from "next/link";
import {
  ArrowRight,
  ArrowDownRight,
  BadgeCheck,
  CircleDollarSign,
  FileSearch,
  Fingerprint,
  ScrollText,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DEMO_STATS = [
  { value: "₹4,72,180", label: "verified in test mode" },
  { value: "38", label: "agent proposals priced" },
  { value: "91.2%", label: "intent → preview conversion" },
  { value: "0", label: "unauthorized payments" },
];

const PILLARS: Array<{
  index: string;
  title: string;
  description: string;
  points?: string[];
  featured: boolean;
}> = [
  {
    index: "01",
    title: "Merchant-controlled by default",
    description:
      "Versioned AI-commerce policies bound order value, quantity, catalog access and agent authority. They are enforced server-side on every request — the model never decides what money can move.",
    points: [
      "Per-SKU quantity caps and budget ceilings",
      "Catalog visibility toggles for agent traffic",
      "Every policy change is versioned and audited",
    ],
    featured: true,
  },
  {
    index: "02",
    title: "Gated by humans",
    description:
      "Agents can discover, recommend and prepare. They cannot spend money or create a payment order without explicit buyer confirmation.",
    featured: false,
  },
  {
    index: "03",
    title: "Verifiable & recoverable",
    description:
      "Every money-relevant action lands in a tamper-evident audit chain — and failed intent is recovered through merchant-approved, bounded interventions.",
    featured: false,
  },
];

const PHASES = [
  {
    phase: "Understand",
    steps: [
      { icon: FileSearch, num: "01", label: "Buyer intent parsed to schema" },
      { icon: Fingerprint, num: "02", label: "Zod-validated or discarded" },
    ],
  },
  {
    phase: "Decide",
    steps: [
      { icon: ShieldCheck, num: "03", label: "Deterministic policy check" },
      { icon: UserCheck, num: "04", label: "Buyer confirmation gate" },
      { icon: CircleDollarSign, num: "05", label: "Razorpay test-mode order" },
    ],
  },
  {
    phase: "Settle",
    steps: [
      { icon: BadgeCheck, num: "06", label: "Server-side signature verify" },
      { icon: ArrowDownRight, num: "07", label: "Atomic fulfilment" },
      { icon: ScrollText, num: "08", label: "Hash-chained audit + insights" },
      { icon: ArrowRight, num: "09", label: "Bounded recovery loop" },
    ],
  },
];

function PolicyLedgerCard() {
  return (
    <div className="relative -rotate-1 rounded-2xl bg-card shadow-lifted-tinted ring-1 ring-foreground/[0.06] transition-transform duration-500 hover:rotate-0">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
        <span className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground">
          session · ck_8f2ad41c
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
          awaiting buyer
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="rounded-lg bg-muted/60 px-3 py-2.5">
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
            &ldquo;Two SQL Pro interview packs, budget ₹800&rdquo;
          </p>
        </div>

        <ul className="space-y-2 text-xs">
          {[
            { ok: true, text: "SKU_INTerview_SQL_PRO × 2 — in stock" },
            { ok: true, text: "Line total ₹718 server-computed" },
            { ok: true, text: "Within budget ceiling (₹800)" },
            { ok: false, text: "Payment order held for confirmation" },
          ].map((row) => (
            <li key={row.text} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[5px] size-1.5 shrink-0 rounded-full",
                  row.ok ? "bg-primary" : "border border-primary bg-transparent",
                )}
              />
              <span
                className={cn(
                  "leading-relaxed",
                  row.ok ? "text-foreground/80" : "font-medium text-foreground",
                )}
              >
                {row.text}
              </span>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-border/70 px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">
              Budget used
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              ₹718 / ₹800
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[89.75%] rounded-full bg-primary" />
          </div>
        </div>

        <Button className="w-full gap-2" tabIndex={-1} aria-hidden="true">
          <UserCheck className="size-4" />
          Confirm test checkout — ₹718
        </Button>
      </div>

      <div className="absolute -right-3 -top-3 rotate-3 rounded-lg bg-primary px-3 py-1.5 shadow-lifted-tinted">
        <p className="font-mono text-[10px] font-semibold tracking-wider text-primary-foreground">
          POLICY v7 ✓
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      {/* Hero */}
      <section className="ambient-pools -mx-4 mt-2 rounded-b-3xl px-4 pb-14 pt-14 sm:-mx-6 sm:px-6 sm:pb-16 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-md border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-accent-foreground shadow-card-tinted">
              <ShieldCheck className="size-3.5 text-primary" />
              Razorpay Hackathon · Track 01 · Agentic commerce
            </span>
            <h1 className="mt-6 max-w-xl font-display text-4xl font-bold leading-[1.05] tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              The control plane for safe AI commerce.
            </h1>
            <p className="mt-6 max-w-[38rem] text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              AgentPay lets businesses expose products to AI buyers with hard
              limits on autonomous purchase behavior — and recovers failed
              payment intent inside merchant rules instead of losing it.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground/90">
              Agents can discover, recommend and prepare purchases. They cannot
              spend money, create an order, or touch inventory without
              deterministic controls and a verifiable event trail.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link href="/buy">
                  Try the agent
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link href="/merchant">Open merchant console</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <PolicyLedgerCard />
          </div>
        </div>
      </section>

      {/* Demo stats strip */}
      <section
        aria-label="Demo dataset figures"
        className="rule-ledger mt-2 grid grid-cols-2 gap-x-6 gap-y-8 py-10 sm:grid-cols-4"
      >
        {DEMO_STATS.map((stat) => (
          <div key={stat.label}>
            <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
              {stat.value}
            </p>
            <p className="mt-1.5 max-w-[16ch] text-xs leading-relaxed text-muted-foreground">
              {stat.label}
            </p>
          </div>
        ))}
      </section>

      {/* Pillars — bento */}
      <section className="mt-16 sm:mt-20">
        <div className="mb-8 flex items-baseline gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Three boundaries agents cannot cross
          </h2>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            / principles
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          {PILLARS.filter((p) => p.featured).map((pillar) => (
            <Card
              key={pillar.index}
              className="shadow-card-tinted transition-shadow duration-300 hover:shadow-lifted-tinted"
            >
              <CardHeader className="pb-3">
                <span className="font-mono text-xs text-primary">
                  {pillar.index}
                </span>
                <CardTitle className="pt-1 text-xl">{pillar.title}</CardTitle>
                <CardDescription className="max-w-prose text-sm leading-relaxed">
                  {pillar.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-1">
                  {(pillar.points ?? []).map((point) => (
                    <li
                      key={point}
                      className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground/80"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1 shrink-0 rounded-full bg-primary"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          <div className="grid content-start gap-4">
            {PILLARS.filter((p) => !p.featured).map((pillar) => (
              <Card
                key={pillar.index}
                className="shadow-card-tinted transition-shadow duration-300 hover:shadow-lifted-tinted"
              >
                <CardHeader className="pb-2">
                  <span className="font-mono text-xs text-primary">
                    {pillar.index}
                  </span>
                  <CardTitle className="pt-1 text-base">
                    {pillar.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {pillar.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline — three phases */}
      <section className="mt-16 sm:mt-24">
        <div className="mb-8 flex items-baseline gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            One pipeline, nine trust boundaries
          </h2>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            / how a request settles
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PHASES.map((phase, phaseIdx) => (
            <div
              key={phase.phase}
              className="relative rounded-2xl bg-card p-5 shadow-card-tinted ring-1 ring-foreground/[0.05]"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="font-display text-sm font-semibold tracking-tight text-foreground">
                  {phase.phase}
                </p>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  phase {phaseIdx + 1}/3
                </span>
              </div>
              <ol className="relative space-y-3.5 border-l border-border/80 pl-5">
                {phase.steps.map((step) => (
                  <li key={step.num} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[27px] top-0.5 flex size-[15px] items-center justify-center rounded-full border border-border bg-background"
                    />
                    <div className="flex items-start gap-2">
                      <step.icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-[13px] font-medium leading-snug text-foreground">
                          {step.label}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                          step {step.num}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
          The LLM proposes. Deterministic policy decides. The user approves.
          Razorpay executes under test mode. Server-side verification settles
          it — and the audit chain remembers everything.
        </p>
      </section>

      {/* Closing CTA */}
      <section className="ambient-pools mt-16 rounded-3xl border border-border/60 px-6 py-12 text-center shadow-card-tinted sm:mt-24 sm:py-16">
        <h2 className="mx-auto max-w-lg font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Run an agent purchase end-to-end in two minutes.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Test mode only. Every step is auditable, reversible, and bounded by
          policy you control.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link href="/buy">
              Start a request
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/architecture">Read the architecture</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
