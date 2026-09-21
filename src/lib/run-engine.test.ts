import { describe, expect, it } from "vitest";
import { backtestRunV2, predictRunV2, type RunDraw } from "./run-engine";

const rows = (top2: string, bottom2: string, count = 30): RunDraw[] =>
  Array.from({ length: count }, (_, index) => ({
    top2,
    bottom2,
    drawDate: `draw-${index}`,
  }));

describe("Run Engine v2", () => {
  it("scores top and bottom separately and returns one primary plus two distinct runners", () => {
    const prediction = predictRunV2(rows("77", "33"));

    expect(prediction.diagnostics.top.digit).toBe(7);
    expect(prediction.diagnostics.bottom.digit).toBe(3);
    expect(prediction.diagnostics.selectedSide).toBe("top");
    expect(prediction.primary).toBe(7);
    expect(prediction.runners).toHaveLength(2);
    expect(new Set([prediction.primary, ...prediction.runners]).size).toBe(3);
    expect(prediction.diagnostics.agreementBoost).toBe(0);
  });

  it("boosts an agreed digit and records both side scores", () => {
    const prediction = predictRunV2(rows("77", "77"));

    expect(prediction.diagnostics.top.digit).toBe(7);
    expect(prediction.diagnostics.bottom.digit).toBe(7);
    expect(prediction.primary).toBe(7);
    expect(prediction.diagnostics.selectedSide).toBe("agreement");
    expect(prediction.diagnostics.agreementBoost).toBeGreaterThan(0);
    expect(prediction.diagnostics.confidenceGap).toBeGreaterThan(
      prediction.diagnostics.top.confidenceGap
    );
  });

  it("can select the bottom side when its evidence is stronger", () => {
    const history = Array.from({ length: 30 }, (_, index) => ({
      top2: `${index % 10}${(index * 7 + 2) % 10}`,
      bottom2: "88",
    }));
    const prediction = predictRunV2(history);

    expect(prediction.diagnostics.bottom.digit).toBe(8);
    expect(prediction.diagnostics.selectedSide).toBe("bottom");
    expect(prediction.primary).toBe(8);
  });

  it("uses walk-forward side hit rates for bounded market weights", () => {
    const history = Array.from({ length: 30 }, (_, index) => ({
      top2: "77",
      bottom2: `${index % 10}${(index * 3 + 1) % 10}`,
    }));
    const prediction = predictRunV2(history);

    expect(prediction.diagnostics.reliability.top).toEqual({ hits: 25, trials: 25 });
    expect(prediction.diagnostics.marketWeights.top).toBeGreaterThan(1);
    expect(prediction.diagnostics.marketWeights.top).toBeLessThanOrEqual(1.2);
    expect(prediction.diagnostics.marketWeights.bottom).toBeGreaterThanOrEqual(0.8);
  });

  it("tracks each 5/10/20/30 window and exposes stability and confidence gap", () => {
    const history = [...rows("11", "22", 25), ...rows("77", "33", 5)];
    const top = predictRunV2(history).diagnostics.top;

    expect(Object.keys(top.windowScores)).toEqual(["5", "10", "20", "30"]);
    expect(top.windowScores[5]).toBe(1);
    expect(top.windowScores[30]).toBeLessThan(top.windowScores[5]);
    expect(top.stability).toBeGreaterThanOrEqual(0);
    expect(top.stability).toBeLessThanOrEqual(1);
    expect(top.confidenceGap).toBeCloseTo(top.score - top.scores[top.runner]);
  });

  it("backtests without reading the target or later draws into predictions", () => {
    const history = rows("77", "33", 20);
    const future = [...history, { top2: "77", bottom2: "45", drawDate: "target" }];
    const alternate = [...history, { top2: "12", bottom2: "45", drawDate: "target" }];
    const expected = predictRunV2(history);

    expect(backtestRunV2(future)[0].primary).toBe(expected.primary);
    expect(backtestRunV2(alternate)[0].primary).toBe(expected.primary);
    expect(backtestRunV2(future)[0].hitTop).toBe(true);
    expect(backtestRunV2(alternate)[0].hitTop).toBe(false);
    expect(backtestRunV2(future)[0].asOfDrawDate).toBe("draw-19");
  });
});
