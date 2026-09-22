import { describe, expect, it } from "vitest";
import { reconcileRunWithPairs } from "./cross-signal";
import type { RunDiagnostics } from "./run-engine";

function mockRun(
  values: Partial<Record<number, number>>,
  primary: number
) {
  const scores = Array<number>(10).fill(0);
  for (const [digit, value] of Object.entries(values)) {
    scores[Number(digit)] = value ?? 0;
  }

  const ranked = scores
    .map((_, digit) => digit)
    .sort((a, b) => scores[b] - scores[a] || a - b);
  const runner = ranked.find((digit) => digit !== primary) ?? 0;
  const diagnostic = {
    digit: primary,
    runner,
    score: scores[primary],
    confidenceGap: scores[primary] - scores[runner],
    stability: 1,
    windowScores: { 5: 1, 10: 1, 20: 1, 30: 1 },
    scores,
  };

  const diagnostics: RunDiagnostics = {
    top: { ...diagnostic, scores: [...scores] },
    bottom: { ...diagnostic, scores: [...scores] },
    marketWeights: { top: 1, bottom: 1 },
    reliability: {
      top: { hits: 0, trials: 0 },
      bottom: { hits: 0, trials: 0 },
    },
    selectedSide: "top",
    agreementBoost: 0,
    confidenceGap: diagnostic.confidenceGap,
    confidenceBucket: "MID",
    backtest: [],
  };

  return {
    primary,
    runners: ranked.filter((digit) => digit !== primary).slice(0, 2),
    diagnostics,
  };
}

describe("Cross-Signal Agreement", () => {
  it("promotes a close Run challenger when Top-3/Top-5 strongly support it", () => {
    const run = mockRun({ 5: 0.82, 2: 0.77, 7: 0.7 }, 5);
    const result = reconcileRunWithPairs(
      run,
      ["27", "72", "29"],
      ["27", "72", "29", "24", "79"]
    );

    expect(result.primary).toBe(2);
    expect(result.runners).toContain(5);
    expect(result.diagnostics.crossSignal?.switched).toBe(true);
    expect(result.diagnostics.crossSignal?.reason).toBe("challenger_pair_support");
    expect(result.diagnostics.crossSignal?.pairScores[2]).toBeCloseTo(100);
    expect(result.diagnostics.crossSignal?.top3Support[2]).toBe(3);
  });

  it("keeps the Run winner when its lead is at least 15 normalized points", () => {
    const run = mockRun({ 5: 0.95, 2: 0.7, 7: 0.64 }, 5);
    const result = reconcileRunWithPairs(
      run,
      ["27", "72", "29"],
      ["27", "72", "29", "24", "79"]
    );

    expect(result.primary).toBe(5);
    expect(result.diagnostics.crossSignal?.switched).toBe(false);
    expect(result.diagnostics.crossSignal?.reason).toBe("strong_run_lead");
  });

  it("keeps the Run winner when Top-3 already agrees with it", () => {
    const run = mockRun({ 5: 0.82, 2: 0.8, 7: 0.74 }, 5);
    const result = reconcileRunWithPairs(
      run,
      ["52", "27", "29"],
      ["52", "27", "29", "24", "79"]
    );

    expect(result.primary).toBe(5);
    expect(result.diagnostics.crossSignal?.reason).toBe("run_pair_agreement");
  });

  it("does not let Pair support promote a challenger more than 15 Run points behind", () => {
    const run = mockRun({ 5: 0.9, 8: 0.85, 2: 0.7 }, 5);
    const result = reconcileRunWithPairs(
      run,
      ["22", "27", "24"],
      ["22", "27", "24", "29", "20"]
    );

    expect(result.primary).toBe(5);
    expect(result.diagnostics.crossSignal?.switched).toBe(false);
    expect(result.diagnostics.crossSignal?.reason).toBe("no_eligible_challenger");
  });
});
