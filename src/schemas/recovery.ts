import { z } from "zod";

export const recoveryCaseParamSchema = z.object({
  caseId: z.string().min(1).max(64),
});

export const recoveryRefreshSchema = z.object({
  action: z.enum(["scan", "expire", "both"]).default("both"),
});
