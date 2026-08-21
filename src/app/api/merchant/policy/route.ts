import { NextResponse } from "next/server";
import { merchantPolicyUpdateSchema } from "@/schemas/merchant";
import {
  getPolicyConfig,
  listPolicyVersions,
  updateMerchantPolicy,
} from "@/lib/policy/policy-service";

export const dynamic = "force-dynamic";

/** GET /api/merchant/policy — current versioned policy + history. */
export async function GET() {
  try {
    const [current, versions] = await Promise.all([
      getPolicyConfig(),
      listPolicyVersions(),
    ]);
    return NextResponse.json({ current, versions });
  } catch (error) {
    console.error("[api/merchant/policy GET]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not load policy." } },
      { status: 500 },
    );
  }
}

/** PUT /api/merchant/policy — save a new immutable policy version. */
export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = merchantPolicyUpdateSchema.safeParse(body);
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

    const result = await updateMerchantPolicy(parsed.data);
    return NextResponse.json({
      status: "POLICY_UPDATED",
      policyVersion: result.policyVersion,
      changedFields: result.changedFields,
      note: "A POLICY_CHANGED event was appended to the merchant audit chain.",
    });
  } catch (error) {
    console.error("[api/merchant/policy PUT]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not update policy." } },
      { status: 500 },
    );
  }
}
