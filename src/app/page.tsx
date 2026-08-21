import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  ClipboardList,
  FileSearch,
  Gauge,
  LockKeyhole,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PILLARS = [
  {
    icon: Settings2,
    title: "Merchant-controlled",
    description:
      "Versioned AI-commerce policies bound order value, quantity, catalog access and agent authority — enforced on every request.",
  },
  {
    icon: LockKeyhole,
    title: "Gated by humans",
    description:
      "Agents can discover, recommend and prepare. They cannot spend money or create a payment order without explicit buyer confirmation.",
  },
  {
    icon: ScrollText,
    title: "Verifiable & recoverable",
    description:
      "Every money-relevant action lands in a tamper-evident audit chain — and failed intent is recovered through merchant-approved, bounded interventions.",
  },
];

const FLOW = [
  { icon: Bot, label: "Buyer Intent" },
  { icon: FileSearch, label: "AI Parsing" },
  { icon: ShieldCheck, label: "Merchant Policy" },
  { icon: UserCheck, label: "Buyer Confirmation" },
  { icon: CircleDollarSign, label: "Razorpay Checkout" },
  { icon: BadgeCheck, label: "Verified Webhook" },
  { icon: Gauge, label: "Atomic Fulfilment" },
  { icon: ScrollText, label: "Audit + Insights" },
  { icon: ClipboardList, label: "Recovery" },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
      <section className="flex flex-col items-center py-16 text-center sm:py-24">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          <ShieldCheck className="size-3.5" />
          Razorpay Hackathon · Track 01 · Agentic Commerce
        </span>
        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          The control plane for safe AI commerce.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          AgentPay lets businesses safely expose products to AI buyers, control
          autonomous purchase behavior, recover failed payment intent, and
          measure the revenue impact of agentic commerce.
        </p>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground/90">
          AI agents can discover, recommend, and prepare purchases. They cannot
          spend money, create a payment order, or fulfil inventory without
          deterministic merchant controls and a verifiable event trail.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <Card key={pillar.title} className="border-border/80 shadow-sm">
            <CardContent className="pt-6">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <pillar.icon className="size-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{pillar.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {pillar.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-14 rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          One pipeline, nine trust boundaries
        </h2>
        <div className="mt-6 flex flex-wrap items-stretch justify-center gap-2">
          {FLOW.map((step, index) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex min-w-[6.8rem] flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 py-3 text-center">
                <step.icon className="size-4 text-primary" />
                <span className="text-xs font-medium leading-tight text-foreground">
                  {step.label}
                </span>
              </div>
              {index < FLOW.length - 1 && (
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" />
              )}
            </div>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center text-sm text-muted-foreground">
          The LLM proposes. Deterministic policy decides. The user approves.
          Razorpay executes under test mode. Server-side verification settles
          it — and the audit chain remembers everything.
        </p>
      </section>
    </div>
  );
}
