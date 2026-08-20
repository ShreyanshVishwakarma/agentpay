import { z } from "zod";

/**
 * Environment validation. All values are optional at the type level so the
 * app boots gracefully without Razorpay or LLM credentials — features
 * degrade explicitly (see `razorpayConfigured` / `llmConfigured`).
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("file:./dev.db"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  RAZORPAY_KEY_ID: z
    .string()
    .default("")
    .transform((value) => value.trim()),
  RAZORPAY_KEY_SECRET: z
    .string()
    .default("")
    .transform((value) => value.trim()),
  OPENAI_API_KEY: z
    .string()
    .default("")
    .transform((value) => value.trim()),
  OPENAI_MODEL: z
    .string()
    .default("")
    .transform((value) => value.trim()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`,
  );
}

export const env = parsed.data;

export const razorpayConfigured =
  env.RAZORPAY_KEY_ID.length > 0 && env.RAZORPAY_KEY_SECRET.length > 0;

export const llmConfigured = env.OPENAI_API_KEY.length > 0;
