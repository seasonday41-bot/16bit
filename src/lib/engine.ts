import type { Market, MarketResult, MarketSignal } from "../types";

const LAMBDA = 0.96;
export const MIN_HISTORY = 20;

function pairDigits(pair: string): [number, number] {
  return [Number(pair[0]), Number(pair[1])];
}

function pairNumber(pair: string): number {
  return Number(pair);
}

function padPair(value: number): string {
  return String(value).padStart(2, "0");
}

function top2(top3: string): string {
  return String(top3).padStart(3, "0").slice(-2);
}

function bottom2(value: string): string {
  return String(value).padStart(2, "0").slice(-2);
}

function rank(values: Float64Array): number[] {
  return [...values.keys()].sort((a, b) => values[b] - values[a] || a - b);
}

function maxOrOne(values: Float64Array): number {
  return Math.max(...values, 1);
}

export function predictMarket(
  market: Market,
  inputRows: MarketResult[]
): MarketSignal | null {
  const history = inputRows
    .filter((row) => row.market_id === market.id)
    .map((row) => ({
      ...row,
      top2: top2(row.top3),
      bottom2: bottom2(row.bottom2),
    }))
    .sort(
      (a, b) =>
        a.draw_date.localeCompare(b.draw_date) ||
        String(a.recorded_at ?? "").localeCompare(String(b.recorded_at ?? ""))
    );

  if (history.length < MIN_HISTORY) {
    return null;
  }

  const pairScore = new Float64Array(100);
  const tens = new Float64Array(10);
  const units = new Float64Array(10);
  const recent10 = new Float64Array(100);

  for (let index = 0; index < history.length; index += 1) {
    const age = history.length - 1 - index;
    const weight = Math.pow(LAMBDA, age);

    for (const pair of [history[index].top2, history[index].bottom2]) {
      const pairId = pairNumber(pair);
      const [a, b] = pairDigits(pair);

      pairScore[pairId] += weight;
      tens[a] += weight;
      units[b] += weight;

      if (index >= history.length - 10) {
        recent10[pairId] += 1;
      }
    }
  }

  const last = history[history.length - 1];
  const transitionScore = new Float64Array(100);

  for (const previousPair of [last.top2, last.bottom2]) {
    const [lastTens, lastUnits] = pairDigits(previousPair);
    const byTens = Array.from({ length: 10 }, () => new Float64Array(100));
    const byUnits = Array.from({ length: 10 }, () => new Float64Array(100));

    for (let index = 1; index < history.length; index += 1) {
      const previousPairs = [
        history[index - 1].top2,
        history[index - 1].bottom2,
      ];
      const currentPairs = [history[index].top2, history[index].bottom2];

      for (const sourcePair of previousPairs) {
        const [sourceTens, sourceUnits] = pairDigits(sourcePair);

        for (const currentPair of currentPairs) {
          const currentId = pairNumber(currentPair);
          byTens[sourceTens][currentId] += 1;
          byUnits[sourceUnits][currentId] += 1;
        }
      }
    }

    for (let pairId = 0; pairId < 100; pairId += 1) {
      transitionScore[pairId] +=
        byTens[lastTens][pairId] + byUnits[lastUnits][pairId];
    }
  }

  const maxPair = maxOrOne(pairScore);
  const maxRecent = maxOrOne(recent10);
  const maxTransition = maxOrOne(transitionScore);
  const maxTens = maxOrOne(tens);
  const maxUnits = maxOrOne(units);

  const pairEnsemble = new Float64Array(100);

  for (let pairId = 0; pairId < 100; pairId += 1) {
    const [a, b] = pairDigits(padPair(pairId));
    const joint = pairScore[pairId] / maxPair;
    const marginal = 0.5 * (tens[a] / maxTens + units[b] / maxUnits);
    const recent = recent10[pairId] / maxRecent;
    const transition = transitionScore[pairId] / maxTransition;

    pairEnsemble[pairId] =
      0.4 * joint + 0.25 * marginal + 0.2 * recent + 0.15 * transition;
  }

  const pairRank = rank(pairEnsemble);

  const runLong = new Float64Array(10);
  const runRecent = new Float64Array(10);
  const runTransition = new Float64Array(10);

  for (let index = 0; index < history.length; index += 1) {
    const age = history.length - 1 - index;
    const weight = Math.pow(LAMBDA, age);

    for (const pair of [history[index].top2, history[index].bottom2]) {
      const uniqueDigits = new Set(pairDigits(pair));

      for (const digit of uniqueDigits) {
        runLong[digit] += weight;
      }

      if (index >= history.length - 10) {
        for (const digit of uniqueDigits) {
          runRecent[digit] += 1;
        }
      }
    }
  }

  const previousDigits = new Set([
    ...pairDigits(last.top2),
    ...pairDigits(last.bottom2),
  ]);
  const transitions = Array.from(
    { length: 10 },
    () => new Float64Array(10)
  );

  for (let index = 1; index < history.length; index += 1) {
    const sourceDigits = new Set([
      ...pairDigits(history[index - 1].top2),
      ...pairDigits(history[index - 1].bottom2),
    ]);
    const currentDigits = new Set([
      ...pairDigits(history[index].top2),
      ...pairDigits(history[index].bottom2),
    ]);

    for (const sourceDigit of sourceDigits) {
      for (const currentDigit of currentDigits) {
        transitions[sourceDigit][currentDigit] += 1;
      }
    }
  }

  for (const sourceDigit of previousDigits) {
    for (let digit = 0; digit < 10; digit += 1) {
      runTransition[digit] += transitions[sourceDigit][digit];
    }
  }

  const maxRunLong = maxOrOne(runLong);
  const maxRunRecent = maxOrOne(runRecent);
  const maxRunTransition = maxOrOne(runTransition);
  const runScore = new Float64Array(10);

  for (let digit = 0; digit < 10; digit += 1) {
    runScore[digit] =
      0.5 * (runLong[digit] / maxRunLong) +
      0.3 * (runRecent[digit] / maxRunRecent) +
      0.2 * (runTransition[digit] / maxRunTransition);
  }

  const runRank = rank(runScore);

  return {
    market,
    top3Pairs: pairRank.slice(0, 3).map(padPair),
    top5Pairs: pairRank.slice(0, 5).map(padPair),
    runDigit: runRank[0],
    runRunners: runRank.slice(1, 3),
    latestTop2: last.top2,
    latestBottom2: last.bottom2,
    latestDrawDate: last.draw_date,
    historyCount: history.length,
  };
}
