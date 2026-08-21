import { NextResponse } from "next/server";
import { recoveryCaseParamSchema } from "@/schemas/recovery";
import {
  RecoveryActionError,
  acceptAlternativeOffer,
} from "@/lib/recovery/recovery-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/recovery/[caseId]/accept-alternative
 * Buyer accepts an offered alternative. Creates a fresh checkout through
 * the normal preview pipeline (full policy re-check) and returns the new
 * session id for /buy?resume=…
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

    const result = await acceptAlternativeOffer(parsed.data.caseId);
    return NextResponse.json({
      status: "ALTERNATIVE_ACCEPTED",
      sessionId: result.sessionId,
      resumeUrl: `/buy?resume=${result.sessionId}`,
    });
  } catch (error) {
    if (error instanceof RecoveryActionError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 409 },
      );
    }
    console.error("[api/recovery/accept-alternative]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not accept alternative." } },
      { status: 500 },
    );
  }
}
