import { env, razorpayConfigured } from "@/lib/env";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

export class RazorpayApiError extends Error {
  readonly status: number;
  /** User-safe description; technical detail stays in server logs/audit. */
  readonly publicMessage: string;

  constructor(status: number, message: string, publicMessage: string) {
    super(message);
    this.name = "RazorpayApiError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

export function isRazorpayConfigured(): boolean {
  return razorpayConfigured;
}

function authHeader(): string {
  const credentials = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * Thin server-side wrapper around the Razorpay REST API using Basic auth.
 * Never call this from client code — the key secret must stay on the server.
 */
export async function razorpayRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  if (!razorpayConfigured) {
    throw new RazorpayApiError(
      0,
      "Razorpay credentials are not configured",
      "Demo payment mode unavailable",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new RazorpayApiError(
      0,
      `Razorpay request failed: ${error instanceof Error ? error.message : "unknown"}`,
      "Could not reach the payment gateway. Please try again.",
    );
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error body — keep null and surface status below.
  }

  if (!response.ok) {
    const description =
      json !== null &&
      typeof json === "object" &&
      "error" in json &&
      json.error !== null &&
      typeof json.error === "object" &&
      "description" in json.error &&
      typeof json.error.description === "string"
        ? json.error.description
        : `HTTP ${response.status}`;

    const isAuthFailure = response.status === 401 || description.toLowerCase().includes("authentication");
    throw new RazorpayApiError(
      response.status,
      `Razorpay API error: ${description}`,
      isAuthFailure
        ? "Razorpay authentication failed — Key ID and Secret do not match (HTTP 401). Open Razorpay Dashboard → Test Mode → Settings → API Keys and copy the paired Key ID + Key Secret together, then restart the dev server."
        : "The payment gateway rejected the request. No charge has been made.",
    );
  }

  return json as T;
}
