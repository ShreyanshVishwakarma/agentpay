import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/shared/app-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AgentPay — Safe AI checkout for the agentic web",
    template: "%s — AgentPay",
  },
  description:
    "AgentPay turns buyer intent into bounded, explainable Razorpay test-mode transactions.",
  openGraph: {
    title: "AgentPay — Safe AI checkout for the agentic web",
    description:
      "Agents can discover and propose. Deterministic policy decides. Nothing is charged until the buyer confirms.",
    type: "website",
    siteName: "AgentPay",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentPay — Safe AI checkout for the agentic web",
    description:
      "Agents can discover and propose. Deterministic policy decides. Nothing is charged until the buyer confirms.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <div className="grain-overlay" aria-hidden="true" />
        <AppHeader />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <footer className="mt-auto border-t border-border/70">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="max-w-xs">
              <p className="font-display text-sm font-semibold tracking-tight">
                AgentPay
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                The control plane for safe AI commerce. Built on Razorpay Test
                Mode — no real money is ever processed.
              </p>
            </div>
            <nav
              aria-label="Footer"
              className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-muted-foreground"
            >
              <div className="flex flex-col gap-2.5">
                <p className="text-[11px] font-medium uppercase tracking-widest text-foreground/60">
                  Product
                </p>
                <Link href="/buy" className="transition-colors hover:text-foreground">
                  Agent checkout
                </Link>
                <Link
                  href="/merchant"
                  className="transition-colors hover:text-foreground"
                >
                  Merchant console
                </Link>
                <Link
                  href="/architecture"
                  className="transition-colors hover:text-foreground"
                >
                  Architecture
                </Link>
              </div>
              <div className="flex flex-col gap-2.5">
                <p className="text-[11px] font-medium uppercase tracking-widest text-foreground/60">
                  Legal
                </p>
                <span className="cursor-default text-muted-foreground/50">
                  Privacy policy
                </span>
                <span className="cursor-default text-muted-foreground/50">
                  Terms of service
                </span>
              </div>
            </nav>
          </div>
          <div className="border-t border-border/60">
            <p className="mx-auto w-full max-w-6xl px-4 py-4 text-[11px] text-muted-foreground sm:px-6">
              Razorpay Hackathon · Track 01: AI Growth &amp; Agentic Commerce ·
              All payment activity is simulated in test mode.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
