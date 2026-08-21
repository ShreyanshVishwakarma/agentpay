import { NextResponse } from "next/server";
import { recoveryCaseParamSchema } from "@/schemas/recovery";
import { RecoveryActionError, declineRecovery } from "@/lib/recovery/recovery-service";

export const dynamic = "force-dynamic";

/** POST /api/recovery/[caseId]/decline — buyer declines the recovery offer. */
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

    await declineRecovery(parsed.data.caseId);
    return NextResponse.json({ status: "RECOVERY_STOPPED", reason: "buyer_declined" });
  } catch (error) {
    if (error instanceof RecoveryActionError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 409 },
      );
    }
    console.error("[api/recovery/decline]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not decline recovery." } },
      { status: 500 },
    );
  }
}
