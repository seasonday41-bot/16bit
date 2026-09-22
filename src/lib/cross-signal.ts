import type {
  CrossSignalDiagnostics,
  CrossSignalReason,
  RunDiagnostics,
} from "./run-engine";

type RunPrediction = {
  primary: number;
  runners: number[];
  diagnostics: RunDiagnostics;
};

const PAIR_WEIGHTS = [10, 8, 6, 3, 2] as const;
const STRONG_RUN_LEAD = 15;
const CLOSE_RUN_GAP = 10;
const MAX_CHALLENGER_DEFICIT = 15;
const PAIR_ADVANTAGE = 20;

function pairDigits(pair: string): number[] {
  return [...new Set(String(pair).padStart(2, "0").slice(-2).split("").map(Number))];
}

function rank(scores: number[]): number[] {
  return scores
    .map((_, digit) => digit)
    .sort((a, b) => scores[b] - scores[a] || a - b);
}

function normalize100(values: number[]): number[] {
  const max = Math.max(...values, 0);
  return max > 0 ? values.map((value) => (value / max) * 100) : values.map(() => 0);
}

function combinedRunScores(run: RunPrediction): number[] {
  const { top, bottom, marketWeights, selectedSide, agreementBoost } = run.diagnostics;
  return top.scores.map(
    (topScore, digit) =>
      (marketWeights.top * topScore + marketWeights.bottom * bottom.scores[digit]) / 2 +
      (selectedSide === "agreement" && digit === run.primary ? agreementBoost : 0)
  );
}

function pairSupport(top5Pairs: string[]): {
  pairScores: number[];
  top3Support: number[];
  agreementBonuses: number[];
} {
  const raw = Array<number>(10).fill(0);
  const top3Support = Array<number>(10).fill(0);

  top5Pairs.slice(0, 5).forEach((pair, index) => {
    const weight = PAIR_WEIGHTS[index] ?? 0;
    for (const digit of pairDigits(pair)) {
      raw[digit] += weight;
      if (index < 3) top3Support[digit] += 1;
    }
  });

  const pairScores = normalize100(raw);
  const agreementBonuses = Array.from({ length: 10 }, (_, digit) => {
    if (top3Support[digit] >= 2) return 8;
    if (top3Support[digit] === 1) return 5;
    if (pairScores[digit] > 0) return 2;
    return 0;
  });

  return { pairScores, top3Support, agreementBonuses };
}

function pickRunners(
  finalScores: number[],
  finalPrimary: number,
  basePrimary: number
): number[] {
  const candidates = rank(finalScores).filter((digit) => digit !== finalPrimary);
  const runners = candidates.slice(0, 2);

  // If Pair support promotes a new primary, preserve the original Run winner
  // as insurance in the runner slots.
  if (finalPrimary !== basePrimary && !runners.includes(basePrimary)) {
    if (runners.length < 2) runners.push(basePrimary);
    else runners[1] = basePrimary;
  }

  return [...new Set(runners)].filter((digit) => digit !== finalPrimary).slice(0, 2);
}

export function reconcileRunWithPairs(
  run: RunPrediction,
  top3Pairs: string[],
  top5Pairs: string[]
): {
  primary: number;
  runners: number[];
  diagnostics: RunDiagnostics;
} {
  const basePrimary = run.primary;
  const runScores = normalize100(combinedRunScores(run));
  const { pairScores, top3Support, agreementBonuses } = pairSupport(top5Pairs);
  const top3Digits = new Set(top3Pairs.flatMap(pairDigits));
  const top5Digits = new Set(top5Pairs.flatMap(pairDigits));

  const finalScores = runScores.map(
    (runScore, digit) =>
      0.6 * runScore + 0.4 * pairScores[digit] + agreementBonuses[digit]
  );

  const bestOtherRun = Math.max(
    ...runScores.filter((_, digit) => digit !== basePrimary)
  );
  const strongRunLead = runScores[basePrimary] - bestOtherRun >= STRONG_RUN_LEAD;
  const runPairAgreement = top3Digits.has(basePrimary);

  let finalPrimary = basePrimary;
  let reason: CrossSignalReason;

  if (strongRunLead) {
    reason = "strong_run_lead";
  } else if (runPairAgreement) {
    reason = "run_pair_agreement";
  } else {
    const baseRunScore = runScores[basePrimary];
    const basePairScore = pairScores[basePrimary];
    const baseFinalScore = finalScores[basePrimary];
    const baseMissingFromTop5 = !top5Digits.has(basePrimary);

    const eligible = rank(finalScores).filter((digit) => {
      if (digit === basePrimary) return false;

      const deficit = baseRunScore - runScores[digit];
      if (deficit > MAX_CHALLENGER_DEFICIT) return false;

      const closeAndTop3 =
        deficit <= CLOSE_RUN_GAP && top3Digits.has(digit);
      const pairAdvantage =
        pairScores[digit] >= basePairScore + PAIR_ADVANTAGE;
      const openConflict =
        baseMissingFromTop5 && pairScores[digit] > 0;

      return closeAndTop3 || pairAdvantage || openConflict;
    });

    const challenger = eligible[0];
    if (challenger === undefined) {
      reason = "no_eligible_challenger";
    } else if (finalScores[challenger] > baseFinalScore) {
      finalPrimary = challenger;
      reason = "challenger_pair_support";
    } else {
      reason = "base_final_score_leads";
    }
  }

  const runners = pickRunners(finalScores, finalPrimary, basePrimary);
  const crossSignal: CrossSignalDiagnostics = {
    basePrimary,
    finalPrimary,
    switched: finalPrimary !== basePrimary,
    reason,
    runScores,
    pairScores,
    finalScores,
    agreementBonuses,
    top3Support,
  };

  return {
    primary: finalPrimary,
    runners,
    diagnostics: {
      ...run.diagnostics,
      crossSignal,
    },
  };
}
