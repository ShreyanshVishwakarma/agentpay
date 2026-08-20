import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "AgentPay — Safe AI checkout for the agentic web",
  description:
    "AgentPay turns buyer intent into bounded, explainable Razorpay test-mode transactions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border/70 py-6">
          <p className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground sm:px-6">
            AgentPay · Razorpay Hackathon — Track 01: AI Growth &amp; Agentic
            Commerce · This project uses Razorpay Test Mode. No real money is
            processed.
          </p>
        </footer>
      </body>
    </html>
  );
}
