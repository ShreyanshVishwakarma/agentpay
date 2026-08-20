import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  FileSearch,
  Fingerprint,
  KeyRound,
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

export const metadata: Metadata = {
  title: "Architecture — AgentPay",
};

const LAYERS = [
  {
    icon: Bot,
    title: "Untrusted LLM layer",
    tone: "border-violet-200 bg-violet-50/60",
    iconTone: "text-violet-600",
    points: [
      "Converts natural language into a Zod-validated PurchaseIntent — nothing more.",
      "Cannot set prices, check inventory, create orders, or claim success.",
      "Schema-invalid or hallucinated output is discarded, never executed.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Deterministic policy engine",
    tone: "border-indigo-200 bg-indigo-50/60",
    iconTone: "text-indigo-600",
    points: [
      "Pure server-side rules: SKU exists, item active, stock available, quantity caps, budget and merchant limits.",
      "Every rupee is recomputed from database prices in integer paise.",
      "Rejections carry machine-readable codes and run identically every time.",
    ],
  },
  {
    icon: UserCheck,
    title: "Confirmation gate",
    tone: "border-amber-200 bg-amber-50/60",
    iconTone: "text-amber-600",
    points: [
      "No Razorpay order exists until the buyer explicitly confirms.",
      "Policies are re-checked against live inventory at confirm time.",
      "Duplicate submissions reuse the existing session — never a second order.",
    ],
  },
  {
    icon: CircleDollarSign,
    title: "Razorpay boundary",
    tone: "border-sky-200 bg-sky-50/60",
    iconTone: "text-sky-600",
    points: [
      "Test-mode Orders API called server-side with amounts from persisted session totals.",
      "Only the key ID reaches the browser; the secret never leaves the server.",
      "Stock is not decremented at order time — payment first, fulfillment later.",
    ],
  },
  {
    icon: KeyRound,
    title: "Signature verification",
    tone: "border-emerald-200 bg-emerald-50/60",
    iconTone: "text-emerald-600",
    points: [
      "HMAC-SHA256 of order_id|payment_id recomputed on the server.",
      "Timing-safe comparison; popup “success” alone proves nothing.",
      "Verified payments decrement stock atomically; failures fulfill nothing.",
    ],
  },
  {
    icon: ScrollText,
    title: "Tamper-evident audit chain",
    tone: "border-slate-200 bg-slate-50",
    iconTone: "text-slate-600",
    points: [
      "Every decision, rejection and transition becomes an event.",
      "eventHash = SHA-256(previousHash | canonical event) — editing history breaks the chain.",
      "One click re-validates the entire chain for any session.",
    ],
  },
];

const PIPELINE = [
  { icon: Bot, label: "Buyer Prompt" },
  { icon: FileSearch, label: "AI Intent Parser" },
  { icon: ShieldCheck, label: "Policy Engine" },
  { icon: UserCheck, label: "Buyer Confirmation" },
  { icon: CircleDollarSign, label: "Razorpay Checkout" },
  { icon: KeyRound, label: "Signature Verification" },
  { icon: ScrollText, label: "Audit Trail" },
];

export default function ArchitecturePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Architecture
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          AgentPay treats the LLM as an untrusted translator sitting at the
          edge of a strictly ordered pipeline. Each layer only trusts the one
          beneath it, and money only moves after a human says so.
        </p>
      </div>

      <div className="mb-10 flex flex-wrap items-stretch justify-center gap-2 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        {PIPELINE.map((step, index) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex min-w-[7rem] flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-background px-3 py-3 text-center">
              <step.icon className="size-4 text-primary" />
              <span className="text-xs font-medium leading-tight">{step.label}</span>
            </div>
            {index < PIPELINE.length - 1 && (
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" />
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LAYERS.map((layer) => (
          <Card key={layer.title} className={`${layer.tone} shadow-sm`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <layer.icon className={`size-4 ${layer.iconTone}`} />
                {layer.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {layer.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <span className={`mt-1.5 size-1 shrink-0 rounded-full ${layer.iconTone.replace("text-", "bg-")}`} />
                    {point}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8 border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Fingerprint className="size-4 text-primary" />
            Why this shape wins trust
          </CardTitle>
          <CardDescription>
            The core principle: <span className="font-medium text-foreground">LLM proposes. Deterministic policy engine decides. User approves. Razorpay executes.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
          <p>
            <span className="font-medium text-foreground">Bounded autonomy.</span>{" "}
            Agents get real purchasing power, but inside hard limits they can
            see, reason about, and never rewrite.
          </p>
          <p>
            <span className="font-medium text-foreground">Explainable outcomes.</span>{" "}
            Every approval or rejection ships with human-readable reasons and
            machine-readable codes.
          </p>
          <p>
            <span className="font-medium text-foreground">Verifiable history.</span>{" "}
            The hash-chained audit log makes “trust us” unnecessary — anyone
            can re-run the chain and check it.
          </p>
        </CardContent>
      </Card>

      <div className="mt-8 flex justify-center">
        <Button asChild size="lg" className="gap-2">
          <Link href="/buy">
            Try the agent
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
