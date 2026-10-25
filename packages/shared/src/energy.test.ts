import { describe, expect, it } from "vitest";
import { energyPrice, energySchema, energyUsdValue, textReplyCostUsd, toEnergy } from "./energy.js";

describe("energyPrice", () => {
  it("rounds up to the next hundredth: $0.00336 with 50% is 0.51 energy", () => {
    expect(energyPrice(0.00336, 50)).toBe(51);
  });

  it("gives 0.3 energy for $0.003 with 0%, and 0.45 with 50%, with no float drift", () => {
    expect(energyPrice(0.003, 0)).toBe(30);
    expect(energyPrice(0.003, 50)).toBe(45);
  });

  it("gives 0 for a cost of 0", () => {
    expect(energyPrice(0, 0)).toBe(0);
  });
});

describe("textReplyCostUsd", () => {
  it("uses 16,000 prompt tokens and 400 completion tokens", () => {
    expect(textReplyCostUsd(0.0000002, 0.0000004)).toBeCloseTo(0.00336, 10);
  });
});

describe("energySchema", () => {
  it("changes an energy value into hundredths", () => {
    expect(energySchema.parse(0.5)).toBe(50);
    expect(energySchema.parse(99.75)).toBe(9975);
    expect(energySchema.parse(0.29)).toBe(29);
  });

  it("refuses 3 decimal places and a value below 0", () => {
    expect(energySchema.safeParse(0.555).success).toBe(false);
    expect(energySchema.safeParse(-1).success).toBe(false);
  });
});

describe("toEnergy and energyUsdValue", () => {
  it("shows hundredths as energy with no trailing zeros", () => {
    expect(toEnergy(9950)).toBe(99.5);
    expect(String(toEnergy(9950))).toBe("99.5");
  });

  it("gives $0.01 for each energy", () => {
    expect(energyUsdValue(30)).toBe(0.003);
    expect(energyUsdValue(1)).toBe(0.0001);
  });
});
