import { NextResponse } from "next/server";
import { interpretRequestSchema } from "@/schemas/agent";
import { parsePurchaseIntent, IntentParseError } from "@/lib/agent/intent-parser";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/interpret
 *
 * Converts natural language into a structured purchase intent. The LLM (or
 * deterministic fallback) only proposes; it never approves or prices.
 */
export async function POST(request: Request) {
  try {
    const ipHeader = request.headers.get("x-forwarded-for") ?? "local";
    const ip = ipHeader.split(",")[0]?.trim() || "local";
    const limit = rateLimit(`interpret:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many requests. Please wait ${limit.retryAfterSeconds}s and try again.`,
          },
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const body: unknown = await request.json();
    const parsedBody = interpretRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INTENT",
            message: "Send a JSON body like { \"message\": \"Buy two SQL Pro packs under ₹800\" }.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const result = await parsePurchaseIntent(parsedBody.data.message);
      return NextResponse.json({
        intent: result.intent,
        mode: result.mode,
      });
    } catch (error) {
      if (error instanceof IntentParseError) {
        return NextResponse.json(
          { error: { code: "INVALID_INTENT", message: error.message } },
          { status: 422 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("[api/agent/interpret]", error);
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INTENT",
          message: "Could not process your request. Please restate it.",
        },
      },
      { status: 500 },
    );
  }
}
