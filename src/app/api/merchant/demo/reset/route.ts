import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/demo/demo-seed";

export const dynamic = "force-dynamic";

/**
 * POST /api/merchant/demo/reset
 * Wipes and rebuilds the synthetic demo dataset (sessions, audit chains,
 * recovery cases, webhook evidence). Never touches real payment state —
 * this entire application runs on Razorpay Test Mode with synthetic data.
 */
export async function POST() {
  try {
    const result = await resetDemoData();
    return NextResponse.json({
      status: "DEMO_DATA_RESET",
      syntheticSessions: result.sessions,
      note: "All rebuilt data is explicitly synthetic.",
    });
  } catch (error) {
    console.error("[api/merchant/demo/reset]", error);
    return NextResponse.json(
      { error: { code: "RESET_FAILED", message: "Could not reset demo data." } },
      { status: 500 },
    );
  }
}
