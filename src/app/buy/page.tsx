import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Agent Checkout",
};

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  const { resume } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        kicker="Buyer · test mode"
        title="Agent checkout"
        description="Ask for what you want in plain English — typed or spoken. The AI proposes, deterministic policy decides, and nothing is charged until you confirm."
      />
      <AgentWorkspace resumeSessionId={resume ?? null} />
    </div>
  );
}
