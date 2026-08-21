import { NextResponse } from "next/server";
import { catalogAccessUpdateSchema } from "@/schemas/merchant";
import { updateCatalogAccess } from "@/lib/policy/policy-service";

export const dynamic = "force-dynamic";

/** PATCH /api/merchant/catalog-access — per-product AI access controls. */
export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = catalogAccessUpdateSchema.safeParse(body);
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

    const result = await updateCatalogAccess(parsed.data);
    return NextResponse.json({
      status: "CATALOG_ACCESS_UPDATED",
      sku: result.sku,
      changedFields: result.changedFields,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown SKU")) {
      return NextResponse.json(
        { error: { code: "SKU_NOT_FOUND", message: error.message } },
        { status: 404 },
      );
    }
    console.error("[api/merchant/catalog-access]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not update catalog access." } },
      { status: 500 },
    );
  }
}
