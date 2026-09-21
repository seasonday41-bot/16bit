import { describe, expect, it } from "vitest";
import { predictMarket } from "./engine";
import type { Market, MarketResult } from "../types";

const market: Market = {
  id: "m1",
  market_key: "market_001",
  market_name: "ทดสอบ VIP",
  active: true,
};

function makeRows(): MarketResult[] {
  return Array.from({ length: 30 }, (_, index) => {
    const a = (index * 7 + 3) % 10;
    const b = (index * 3 + 1) % 10;
    const c = (index * 9 + 4) % 10;
    const d = (index * 5 + 2) % 10;
    const e = (index * 2 + 8) % 10;

    return {
      market_id: market.id,
      draw_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      top3: `${a}${b}${c}`,
      bottom2: `${d}${e}`,
    };
  });
}

describe("predictMarket", () => {
  it("returns Top-3, Top-5 and Run19 without duplicate ranking slots", () => {
    const signal = predictMarket(market, makeRows());

    expect(signal).not.toBeNull();
    expect(signal?.top3Pairs).toHaveLength(3);
    expect(signal?.top5Pairs).toHaveLength(5);
    expect(signal?.top3Pairs).toEqual(["72", "28", "76"]);
    expect(signal?.top5Pairs).toEqual(["72", "28", "76", "24", "20"]);
    expect(signal?.top3Pairs).toEqual(signal?.top5Pairs.slice(0, 3));
    expect(new Set(signal?.top5Pairs).size).toBe(5);
    expect(signal?.runDigit).toBeGreaterThanOrEqual(0);
    expect(signal?.runDigit).toBeLessThanOrEqual(9);
    expect(signal?.runRunners).toHaveLength(2);
    expect(new Set([signal?.runDigit, ...signal!.runRunners]).size).toBe(3);
    expect(signal?.runDiagnostics.backtest).toHaveLength(10);
  });

  it("waits until at least 20 historical draws exist", () => {
    expect(predictMarket(market, makeRows().slice(0, 19))).toBeNull();
  });
});
