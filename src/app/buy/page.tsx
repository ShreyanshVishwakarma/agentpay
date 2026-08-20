import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent/agent-workspace";

export const metadata: Metadata = {
  title: "Agent Checkout — AgentPay",
};

export default function BuyPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Agent Checkout
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask for what you want in plain English. The AI proposes, deterministic
          policy decides, and nothing is charged until you confirm.
        </p>
      </div>
      <AgentWorkspace />
    </div>
  );
}
