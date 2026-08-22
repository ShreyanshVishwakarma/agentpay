import type { Metadata } from "next";
import { CheckoutClient } from "@/components/agent/checkout-client";

export const metadata: Metadata = {
  title: "Secure Checkout — AgentPay",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <CheckoutClient sessionId={session ?? null} />
    </div>
  );
}
