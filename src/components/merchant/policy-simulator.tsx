"use client";

import { useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Scenario {
  key: string;
  label: string;
  description: string;
}

interface Outcome {
  approved: boolean;
  rejectionCode: string | null;
  responsibleControl: string | null;
  explanation: string;
  suggestedAction: string | null;
}

export function PolicySimulator({ scenarios }: { scenarios: Scenario[] }) {
  const [selected, setSelected] = useState(scenarios[0]?.key ?? "");
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setOutcome(null);
    try {
      const response = await fetch("/api/merchant/policy/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioKey: selected }),
      });
      const data = (await response.json()) as Outcome & { error?: { message: string } };
      if (!response.ok) {
        setError(data.error?.message ?? "Simulation failed.");
      } else {
        setOutcome(data);
      }
    } catch {
      setError("Network error during simulation.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FlaskConical className="size-4 text-indigo-600" />
          Policy simulator
        </CardTitle>
        <CardDescription>
          Dry-run a seeded scenario against the current policy. Simulations
          never create checkout sessions or Razorpay orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {scenarios.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              onClick={() => setSelected(scenario.key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selected === scenario.key
                  ? "border-indigo-400 bg-indigo-100 font-medium text-indigo-800"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {scenario.label}
            </button>
          ))}
        </div>

        <Button size="sm" variant="outline" onClick={run} disabled={running || !selected} className="gap-2">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
          Run simulation
        </Button>

        {outcome && (
          <div
            className={`rounded-lg border px-3 py-2.5 text-sm ${
              outcome.approved
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <p className="flex items-center gap-1.5 font-medium">
              {outcome.approved ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              {outcome.approved ? "Would be approved" : `Would be blocked — ${outcome.rejectionCode}`}
            </p>
            <p className="mt-1 text-xs leading-relaxed">{outcome.explanation}</p>
            {!outcome.approved && outcome.responsibleControl && (
              <p className="mt-1.5 text-xs">
                <span className="font-medium">Responsible control: </span>
                <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11px]">
                  {outcome.responsibleControl}
                </code>
              </p>
            )}
            {!outcome.approved && outcome.suggestedAction && (
              <p className="mt-1 text-xs">{outcome.suggestedAction}</p>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-700">{error}</p>}

        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-500">
          No sessions or orders are created by simulation
        </Badge>
      </CardContent>
    </Card>
  );
}
