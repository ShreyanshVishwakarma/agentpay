import { NextResponse } from "next/server";
import { recoveryCaseParamSchema } from "@/schemas/recovery";
import {
  RecoveryActionError,
  approveAndExecuteRecovery,
} from "@/lib/recovery/recovery-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/recovery/[caseId]/approve
 * Explicit merchant approval gate, then simulated in-app execution.
 * The client cannot influence expected value, message content, or policy —
 * everything is recomputed server-side from persisted state.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    const parsed = recoveryCaseParamSchema.safeParse({ caseId });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Invalid case id." } },
        { status: 400 },
      );
    }

    const result = await approveAndExecuteRecovery(parsed.data.caseId);
    return NextResponse.json({
      status: "RECOVERY_EXECUTED",
      caseId: parsed.data.caseId,
      interventionType: result.interventionType,
      attemptCount: result.attemptCount,
      copyMode: result.copyMode,
      messagePreview: result.message,
      note: "Simulated in-app delivery. No real message was sent and no payment was initiated.",
    });
  } catch (error) {
    if (error instanceof RecoveryActionError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 409 },
      );
    }
    console.error("[api/recovery/approve]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not execute recovery action." } },
      { status: 500 },
    );
  }
}
