import { describe, expect, it } from "vitest";
import { predictMarket } from "./engine";
import { FORWARD_RECORDS_KEY, updateForwardRecords } from "./run-records";
import type { Market, MarketResult, MarketSignal } from "../types";

const market: Market = {
  id: "m1",
  market_key: "market_001",
  market_name: "ทดสอบ",
  active: true,
};

const history: MarketResult[] = Array.from({ length: 20 }, (_, index) => ({
  market_id: market.id,
  draw_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  top3: "777",
  bottom2: "33",
}));

function signals(rows: MarketResult[]): Map<string, MarketSignal | null> {
  return new Map([[market.id, predictMarket(market, rows)]]);
}

describe("Run Engine forward records", () => {
  it("recovers from a malformed local record without blocking prediction", () => {
    let saved = "not-json";
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, next: string) => { saved = next; },
    };

    expect(updateForwardRecords(signals(history), history, storage)).toHaveLength(1);
    expect(JSON.parse(saved)).toHaveLength(1);
  });

  it("stores one pre-draw prediction and settles it only after the next draw", () => {
    let value: string | null = null;
    let writes = 0;
    const storage = {
      getItem: (key: string) => (key === FORWARD_RECORDS_KEY ? value : null),
      setItem: (_key: string, next: string) => {
        value = next;
        writes += 1;
      },
    };

    const first = updateForwardRecords(signals(history), history, storage);
    expect(first).toHaveLength(1);
    expect(first[0].primary).toBe(7);
    expect(first[0].targetDrawDate).toBeUndefined();
    updateForwardRecords(signals(history), history, storage);
    expect(writes).toBe(1);

    const nextRows = [
      ...history,
      { market_id: market.id, draw_date: "2026-08-21", top3: "127", bottom2: "33" },
    ];
    const settled = updateForwardRecords(signals(nextRows), nextRows, storage);
    expect(settled).toHaveLength(2);
    expect(settled[0]).toMatchObject({
      primary: 7,
      asOfDrawDate: "2026-08-20",
      targetDrawDate: "2026-08-21",
      hitTop: true,
      hitBottom: false,
      hitEither: true,
    });
    expect(settled[1].asOfDrawDate).toBe("2026-08-21");
    expect(settled[1].targetDrawDate).toBeUndefined();
  });
});
