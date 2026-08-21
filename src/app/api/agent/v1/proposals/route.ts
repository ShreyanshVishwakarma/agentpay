import { NextResponse } from "next/server";
import { agentProposalRequestSchema } from "@/schemas/agent-api";
import { createCheckoutPreview } from "@/lib/checkout/checkout-service";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/v1/proposals
 *
 * Machine-to-machine surface for EXTERNAL AI agents. An LLM agent calls this
 * endpoint as a tool: it posts a cart (SKUs + quantities + optional budget)
 * and receives either a bounded checkout proposal (a session awaiting
 * explicit human confirmation) or a deterministic policy rejection with a
 * machine-readable code.
 *
 * No LLM runs inside this route — the caller is the LLM. AgentPay stays a
 * deterministic merchant control plane.
 */
export async function POST(request: Request) {
  try {
    const ipHeader = request.headers.get("x-forwarded-for") ?? "local";
    const ip = ipHeader.split(",")[0]?.trim() || "local";
    const limit = rateLimit(`agent-proposals:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: `Too many requests. Wait ${limit.retryAfterSeconds}s.` } },
        { status: 429 },
      );
    }

    const body: unknown = await request.json();
    const parsed = agentProposalRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          },
        },
        { status: 400 },
      );
    }

    const outcome = await createCheckoutPreview({
      intent: {
        items: parsed.data.items,
        maxBudgetPaise: parsed.data.maxBudgetPaise,
        clarificationNeeded: false,
      },
      sourceMessage: parsed.data.sourceMessage ?? "external-agent-proposal",
    });

    if (outcome.kind === "rejected") {
      return NextResponse.json({
        status: "REJECTED",
        sessionId: outcome.sessionId,
        reason: outcome.rejection.code,
        message: outcome.rejection.message,
        suggestedAction: outcome.rejection.suggestedAction,
        razorpayOrderCreated: false,
      });
    }

    return NextResponse.json({
      status: "PROPOSAL_READY",
      sessionId: outcome.sessionId,
      totalPaise: outcome.totalPaise,
      formattedTotal: outcome.formattedTotal,
      budgetPaise: outcome.budgetPaise,
      remainingBudgetPaise: outcome.remainingBudgetPaise,
      policyExplanation: outcome.policyExplanation,
      nextStep:
        "A human must confirm this session via POST /api/checkout/confirm before any payment order exists.",
      razorpayOrderCreated: false,
    });
  } catch (error) {
    console.error("[api/agent/v1/proposals]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not create the proposal." } },
      { status: 500 },
    );
  }
}
