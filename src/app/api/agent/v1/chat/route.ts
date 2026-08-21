import { NextResponse } from "next/server";
import { agentChatRequestSchema } from "@/schemas/agent-api";
import { runBuyingAgent } from "@/lib/agent/agent-loop";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/v1/chat
 *
 * Autonomous buying-agent loop. The LLM (or deterministic fallback planner)
 * drives merchant API tools — search_catalog, get_product, propose_checkout —
 * until it produces a bounded checkout proposal, a policy rejection, or a
 * clarifying question. It can never create a payment order.
 */
export async function POST(request: Request) {
  try {
    const ipHeader = request.headers.get("x-forwarded-for") ?? "local";
    const ip = ipHeader.split(",")[0]?.trim() || "local";
    const limit = rateLimit(`agent-chat:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: `Too many requests. Wait ${limit.retryAfterSeconds}s.` } },
        { status: 429 },
      );
    }

    const body: unknown = await request.json();
    const parsed = agentChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Send { \"message\": string }." } },
        { status: 400 },
      );
    }

    const result = await runBuyingAgent(parsed.data.message);

    if (result.outcome.type === "proposal") {
      const proposalSessionId = result.outcome.sessionId;
      // Hydrate the full preview so the UI can render the standard
      // confirmation flow for this session.
      const { db } = await import("@/lib/db");
      const session = await db.checkoutSession.findUnique({
        where: { id: proposalSessionId },
        include: { items: true },
      });
      return NextResponse.json({
        mode: result.mode,
        trace: result.trace,
        outcome: {
          type: "proposal",
          sessionId: proposalSessionId,
          preview: {
            status: "AWAITING_CONFIRMATION",
            sessionId: proposalSessionId,
            items:
              session?.items.map((item) => ({
                sku: item.sku,
                itemName: item.itemName,
                unitPricePaise: item.unitPricePaise,
                formattedUnitPrice: `₹${(item.unitPricePaise / 100).toFixed(2)}`,
                quantity: item.quantity,
                lineTotalPaise: item.lineTotalPaise,
                formattedLineTotal: `₹${(item.lineTotalPaise / 100).toFixed(2)}`,
              })) ?? [],
            totalPaise: result.outcome.totalPaise,
            formattedTotal: result.outcome.formattedTotal,
            budgetPaise: null,
            remainingBudgetPaise: null,
            policyExplanation: [
              "Cart built autonomously by the buying agent, priced server-side",
              "Explicit confirmation is required before any payment action",
            ],
            reusedSession: false,
            razorpayOrderCreated: false,
          },
        },
      });
    }

    return NextResponse.json({ mode: result.mode, trace: result.trace, outcome: result.outcome });
  } catch (error) {
    console.error("[api/agent/v1/chat]", error);
    return NextResponse.json(
      { error: { code: "AGENT_FAILED", message: "The buying agent could not complete your request." } },
      { status: 500 },
    );
  }
}
