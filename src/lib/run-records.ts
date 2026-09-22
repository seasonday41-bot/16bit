import type { MarketResult, MarketSignal } from "../types";

export const FORWARD_RECORDS_KEY = "16bit.run-v2.forward-records";

export type ForwardRecord = {
  marketId: string;
  asOfDrawDate: string;
  primary: number;
  runners: number[];
  selectedSide: MarketSignal["runDiagnostics"]["selectedSide"];
  topScore: number;
  bottomScore: number;
  confidenceGap: number;
  confidenceBucket: MarketSignal["runDiagnostics"]["confidenceBucket"];
  crossSignalSwitched?: boolean;
  crossSignalReason?: string;
  crossSignalBasePrimary?: number;
  targetDrawDate?: string;
  hitTop?: boolean;
  hitBottom?: boolean;
  hitEither?: boolean;
};

type RecordStorage = Pick<Storage, "getItem" | "setItem">;

function isForwardRecord(value: unknown): value is ForwardRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ForwardRecord>;
  return (
    typeof record.marketId === "string" &&
    typeof record.asOfDrawDate === "string" &&
    typeof record.primary === "number" &&
    Number.isInteger(record.primary) &&
    record.primary >= 0 &&
    record.primary <= 9
  );
}

function hasDigit(pair: string, digit: number): boolean {
  return String(pair).padStart(2, "0").slice(-2).includes(String(digit));
}

export function updateForwardRecords(
  signals: Map<string, MarketSignal | null>,
  results: MarketResult[],
  storage: RecordStorage
): ForwardRecord[] {
  const raw = storage.getItem(FORWARD_RECORDS_KEY);
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  const records = Array.isArray(parsed) ? parsed.filter(isForwardRecord) : [];
  let changed = raw !== null && (!Array.isArray(parsed) || records.length !== parsed.length);

  for (const record of records) {
    if (record.targetDrawDate) continue;
    const next = results
      .filter((row) => row.market_id === record.marketId && row.draw_date > record.asOfDrawDate)
      .sort((a, b) => a.draw_date.localeCompare(b.draw_date))[0];
    if (!next) continue;

    record.targetDrawDate = next.draw_date;
    record.hitTop = hasDigit(String(next.top3).padStart(3, "0").slice(-2), record.primary);
    record.hitBottom = hasDigit(next.bottom2, record.primary);
    record.hitEither = record.hitTop || record.hitBottom;
    changed = true;
  }

  for (const [marketId, signal] of signals) {
    if (!signal) continue;
    if (records.some((record) => record.marketId === marketId && record.asOfDrawDate === signal.latestDrawDate)) {
      continue;
    }
    records.push({
      marketId,
      asOfDrawDate: signal.latestDrawDate,
      primary: signal.runDigit,
      runners: [...signal.runRunners],
      selectedSide: signal.runDiagnostics.selectedSide,
      topScore: signal.runDiagnostics.top.score,
      bottomScore: signal.runDiagnostics.bottom.score,
      confidenceGap: signal.runDiagnostics.confidenceGap,
      confidenceBucket: signal.runDiagnostics.confidenceBucket,
      crossSignalSwitched: signal.runDiagnostics.crossSignal?.switched,
      crossSignalReason: signal.runDiagnostics.crossSignal?.reason,
      crossSignalBasePrimary: signal.runDiagnostics.crossSignal?.basePrimary,
    });
    changed = true;
  }

  if (changed) storage.setItem(FORWARD_RECORDS_KEY, JSON.stringify(records));
  return records;
}
