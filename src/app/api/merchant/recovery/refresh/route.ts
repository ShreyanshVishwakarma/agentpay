import { NextResponse } from "next/server";
import { recoveryRefreshSchema } from "@/schemas/recovery";
import {
  expireStaleRecoveryCases,
  scanForRecoveryOpportunities,
} from "@/lib/recovery/recovery-service";
import { getPolicyConfig } from "@/lib/checkout/policy-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/merchant/recovery/refresh
 * Deterministic scan for recoverable sessions. Creates cases with audit
 * events; never contacts buyers and never creates orders.
 */
export async function POST(request: Request) {
  try {
    let action = "both";
    try {
      const body: unknown = await request.json();
      const parsed = recoveryRefreshSchema.safeParse(body);
      if (parsed.success) action = parsed.data.action;
    } catch {
      // Empty body defaults to "both".
    }

    const policy = await getPolicyConfig();
    if (!policy.recoveryEnabled) {
      return NextResponse.json(
        {
          error: {
            code: "RECOVERY_DISABLED",
            message: "Merchant policy has disabled revenue recovery.",
          },
        },
        { status: 409 },
      );
    }

    const expired = action === "scan" ? 0 : await expireStaleRecoveryCases();
    const scan = action === "expire" ? { scanned: 0, created: 0 } : await scanForRecoveryOpportunities();

    return NextResponse.json({
      status: "SCAN_COMPLETE",
      scannedSessions: scan.scanned,
      casesCreated: scan.created,
      casesExpired: expired,
      note: "Cases are proposals only — buyer contact requires explicit merchant approval.",
    });
  } catch (error) {
    console.error("[api/merchant/recovery/refresh]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Recovery scan failed." } },
      { status: 500 },
    );
  }
}
