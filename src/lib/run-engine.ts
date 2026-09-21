export type RunDraw = { top2: string; bottom2: string; drawDate?: string };
export type RunSide = "top" | "bottom";

export type SideDiagnostics = {
  digit: number;
  runner: number;
  score: number;
  confidenceGap: number;
  stability: number;
  windowScores: Record<5 | 10 | 20 | 30, number>;
  scores: number[];
};

export type BacktestRecord = {
  asOfDrawDate?: string;
  targetDrawDate?: string;
  primary: number;
  selectedSide: RunSide | "agreement";
  hitTop: boolean;
  hitBottom: boolean;
  hitEither: boolean;
};

export type RunDiagnostics = {
  top: SideDiagnostics;
  bottom: SideDiagnostics;
  marketWeights: Record<RunSide, number>;
  reliability: Record<RunSide, { hits: number; trials: number }>;
  selectedSide: RunSide | "agreement";
  agreementBoost: number;
  confidenceGap: number;
  confidenceBucket: "LOW" | "MID" | "HIGH";
  backtest: BacktestRecord[];
};

const WINDOWS = [5, 10, 20, 30] as const;
const WINDOW_WEIGHTS = [0.35, 0.3, 0.2, 0.15];
const BASE_HIT_RATE = 0.19; // Two distinct digits in a two-digit result hit 19% of random picks.
const PRIOR_DRAWS = 10;
const AGREEMENT_BOOST = 0.1;

function digits(pair: string): number[] {
  return [...new Set([Number(pair[0]), Number(pair[1])])];
}

function rank(scores: number[]): number[] {
  return scores.map((_, digit) => digit).sort((a, b) => scores[b] - scores[a] || a - b);
}

function normalized(values: number[]): number[] {
  const max = Math.max(...values);
  return max ? values.map((value) => value / max) : values;
}

function scoreSide(pairs: string[]): SideDiagnostics {
  const windowVectors = WINDOWS.map((length) => {
    const counts = Array<number>(10).fill(0);
    for (const pair of pairs.slice(-length)) {
      for (const digit of digits(pair)) counts[digit] += 1;
    }
    return normalized(counts);
  });

  const decayed = Array<number>(10).fill(0);
  pairs.forEach((pair, index) => {
    const weight = Math.pow(0.96, pairs.length - 1 - index);
    for (const digit of digits(pair)) decayed[digit] += weight;
  });
  const decayScores = normalized(decayed);

  const transitions = Array<number>(10).fill(0);
  const lastDigits = digits(pairs[pairs.length - 1]);
  for (let index = 1; index < pairs.length; index += 1) {
    if (digits(pairs[index - 1]).some((digit) => lastDigits.includes(digit))) {
      for (const digit of digits(pairs[index])) transitions[digit] += 1;
    }
  }
  const transitionScores = normalized(transitions);

  const stability = Array.from({ length: 10 }, (_, digit) => {
    const values = windowVectors.map((window) => window[digit]);
    return 1 - (Math.max(...values) - Math.min(...values));
  });
  const scores = Array.from({ length: 10 }, (_, digit) => {
    const multiWindow = windowVectors.reduce(
      (total, window, index) => total + WINDOW_WEIGHTS[index] * window[digit],
      0
    );
    return (
      0.5 * multiWindow +
      0.25 * decayScores[digit] +
      0.15 * transitionScores[digit] +
      0.1 * stability[digit] * multiWindow
    );
  });
  const [digit, runner] = rank(scores);

  return {
    digit,
    runner,
    score: scores[digit],
    confidenceGap: scores[digit] - scores[runner],
    stability: stability[digit],
    windowScores: Object.fromEntries(
      WINDOWS.map((length, index) => [length, windowVectors[index][digit]])
    ) as SideDiagnostics["windowScores"],
    scores,
  };
}

function sideReliability(history: RunDraw[]): RunDiagnostics["reliability"] {
  const reliability = {
    top: { hits: 0, trials: 0 },
    bottom: { hits: 0, trials: 0 },
  };

  // Each trial predicts the next draw from only the prefix available then.
  for (let end = 5; end < history.length; end += 1) {
    for (const side of ["top", "bottom"] as const) {
      const predicted = scoreSide(history.slice(0, end).map((row) => row[`${side}2`])).digit;
      reliability[side].trials += 1;
      if (digits(history[end][`${side}2`]).includes(predicted)) {
        reliability[side].hits += 1;
      }
    }
  }
  return reliability;
}

function marketWeights(reliability: RunDiagnostics["reliability"]): Record<RunSide, number> {
  const rate = (side: RunSide) =>
    (reliability[side].hits + PRIOR_DRAWS * BASE_HIT_RATE) /
    (reliability[side].trials + PRIOR_DRAWS);
  const top = rate("top");
  const bottom = rate("bottom");
  const topWeight = Math.max(0.8, Math.min(1.2, (2 * top) / (top + bottom)));
  return { top: topWeight, bottom: 2 - topWeight };
}

function predictCore(history: RunDraw[]) {
  const top = scoreSide(history.map((row) => row.top2));
  const bottom = scoreSide(history.map((row) => row.bottom2));
  const reliability = sideReliability(history);
  const weights = marketWeights(reliability);
  const strength = (side: RunSide, diagnostic: SideDiagnostics) =>
    weights[side] * (0.75 * diagnostic.score + 0.25 * diagnostic.confidenceGap);
  const selectedSide: RunDiagnostics["selectedSide"] =
    top.digit === bottom.digit
      ? "agreement"
      : strength("top", top) >= strength("bottom", bottom)
        ? "top"
        : "bottom";
  const primary = selectedSide === "bottom" ? bottom.digit : top.digit;
  const combined = top.scores.map(
    (score, digit) =>
      (weights.top * score + weights.bottom * bottom.scores[digit]) / 2 +
      (selectedSide === "agreement" && digit === primary ? AGREEMENT_BOOST : 0)
  );
  const runners = rank(combined).filter((digit) => digit !== primary).slice(0, 2);
  const confidenceGap =
    selectedSide === "agreement"
      ? combined[primary] - Math.max(...combined.filter((_, digit) => digit !== primary))
      : selectedSide === "top"
        ? top.confidenceGap
        : bottom.confidenceGap;
  const confidenceBucket: RunDiagnostics["confidenceBucket"] =
    confidenceGap >= 0.15 ? "HIGH" : confidenceGap >= 0.05 ? "MID" : "LOW";

  return {
    primary,
    runners,
    diagnostics: {
      top,
      bottom,
      marketWeights: weights,
      reliability,
      selectedSide,
      agreementBoost: selectedSide === "agreement" ? AGREEMENT_BOOST : 0,
      confidenceGap,
      confidenceBucket,
    },
  };
}

export function backtestRunV2(history: RunDraw[]): BacktestRecord[] {
  const records: BacktestRecord[] = [];
  for (let end = 20; end < history.length; end += 1) {
    const prediction = predictCore(history.slice(0, end));
    const actual = history[end];
    const hitTop = digits(actual.top2).includes(prediction.primary);
    const hitBottom = digits(actual.bottom2).includes(prediction.primary);
    records.push({
      asOfDrawDate: history[end - 1].drawDate,
      targetDrawDate: actual.drawDate,
      primary: prediction.primary,
      selectedSide: prediction.diagnostics.selectedSide,
      hitTop,
      hitBottom,
      hitEither: hitTop || hitBottom,
    });
  }
  return records;
}

export function predictRunV2(history: RunDraw[]): {
  primary: number;
  runners: number[];
  diagnostics: RunDiagnostics;
} {
  if (history.length < 20) throw new Error("Run Engine v2 requires 20 draws");
  const prediction = predictCore(history);
  return {
    ...prediction,
    diagnostics: {
      ...prediction.diagnostics,
      backtest: backtestRunV2(history),
    },
  };
}
