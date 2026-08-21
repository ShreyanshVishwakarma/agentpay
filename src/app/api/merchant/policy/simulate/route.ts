import { NextResponse } from "next/server";
import { policySimulationRequestSchema } from "@/schemas/merchant";
import { runPolicySimulation, SIMULATION_SCENARIOS } from "@/lib/policy/simulator";

export const dynamic = "force-dynamic";

/** GET /api/merchant/policy/simulate — list seeded scenarios. */
export async function GET() {
  return NextResponse.json({
    scenarios: SIMULATION_SCENARIOS.map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      description: scenario.description,
    })),
  });
}

/**
 * POST /api/merchant/policy/simulate
 * Pure evaluation against the current policy — never creates a checkout
 * session or Razorpay order.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = policySimulationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Provide a valid scenarioKey." } },
        { status: 400 },
      );
    }

    const outcome = await runPolicySimulation(parsed.data.scenarioKey);
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("[api/merchant/policy/simulate]", error);
    return NextResponse.json(
      { error: { code: "SIMULATION_FAILED", message: "Simulation could not run." } },
      { status: 500 },
    );
  }
}
