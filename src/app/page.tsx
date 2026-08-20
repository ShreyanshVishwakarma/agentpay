import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  FileSearch,
  Gauge,
  LockKeyhole,
  ScrollText,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PILLARS = [
  {
    icon: Gauge,
    title: "Bounded",
    description:
      "Every cart is checked against stock, per-order limits and the buyer's stated budget before money is ever mentioned.",
  },
  {
    icon: LockKeyhole,
    title: "Gated",
    description:
      "No Razorpay order exists until a human explicitly confirms. The AI can propose — only you can approve.",
  },
  {
    icon: ScrollText,
    title: "Auditable",
    description:
      "Every decision, rejection and payment transition lands in a tamper-evident hash-chained audit trail.",
  },
];

const FLOW = [
  { icon: Bot, label: "Buyer Prompt" },
  { icon: FileSearch, label: "AI Intent Parser" },
  { icon: ShieldCheck, label: "Policy Engine" },
  { icon: UserCheck, label: "Buyer Confirmation" },
  { icon: CircleDollarSign, label: "Razorpay Checkout" },
  { icon: BadgeCheck, label: "Signature Verification" },
  { icon: ScrollText, label: "Audit Trail" },
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
          Safe AI checkout for the agentic web.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          AgentPay turns buyer intent into bounded, explainable Razorpay
          test-mode transactions.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link href="/buy">
              Try the agent
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="gap-2">
            <Link href="/architecture">View architecture</Link>
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
              <h3 className="text-sm font-semibold text-foreground">
                {pillar.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {pillar.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-14 rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          One pipeline, seven trust boundaries
        </h2>
        <div className="mt-6 flex flex-wrap items-stretch justify-center gap-2">
          {FLOW.map((step, index) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 py-3 text-center">
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
          Razorpay executes. Server-side verification settles it.
        </p>
      </section>
    </div>
  );
}
