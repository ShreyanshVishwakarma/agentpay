import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySessionChain } from "@/lib/audit/audit-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit/[sessionId]
 * Returns the session's audit events plus hash-chain verification result.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;

    const session = await db.checkoutSession.findUnique({
      where: { id: sessionId },
      include: { items: true },
    });

    if (!session) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found." } },
        { status: 404 },
      );
    }

    const [events, chain] = await Promise.all([
      db.auditEvent.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
      verifySessionChain(sessionId),
    ]);

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        totalPaise: session.totalPaise,
        currency: session.currency,
        buyerBudgetPaise: session.buyerBudgetPaise,
        razorpayOrderId: session.razorpayOrderId,
        razorpayPaymentId:
          session.status === "PAYMENT_VERIFIED" ? session.razorpayPaymentId : null,
        rejectionReason: session.rejectionReason,
      },
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        actor: event.actor,
        payload: event.payload,
        previousHash: event.previousHash,
        eventHash: event.eventHash,
        createdAt: event.createdAt.toISOString(),
      })),
      chainVerification: chain,
    });
  } catch (error) {
    console.error("[api/audit/[sessionId]]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not load audit events." } },
      { status: 500 },
    );
  }
}
