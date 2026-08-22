import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent/agent-workspace";

export const metadata: Metadata = {
  title: "Agent Checkout — AgentPay",
};

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  const { resume } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          Agent checkout
        </h1>
        <span className="text-[11px] text-muted-foreground">
          The AI proposes · policy decides · you confirm
        </span>
      </div>
      <AgentWorkspace resumeSessionId={resume ?? null} />
    </div>
  );
}
