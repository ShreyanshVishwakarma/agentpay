import { z } from "zod";

/** POST /api/agent/v1/chat — autonomous buying-agent loop for one message. */
export const agentChatRequestSchema = z.object({
  message: z.string().min(1).max(500),
});

/**
 * POST /api/agent/v1/proposals — machine-to-machine checkout proposals.
 * This is the surface an EXTERNAL LLM agent calls as a tool: it posts a cart
 * and receives a bounded proposal or a policy rejection. No LLM runs here —
 * the caller is the LLM; AgentPay stays deterministic.
 */
export const agentProposalRequestSchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().min(1).max(5),
      }),
    )
    .min(1)
    .max(5),
  maxBudgetPaise: z.number().int().positive().optional(),
  sourceMessage: z.string().max(500).optional(),
});

export type AgentProposalRequest = z.infer<typeof agentProposalRequestSchema>;
