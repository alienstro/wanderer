import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { energyLowText, refillTimeText } from "./energy-text";

/** 00:00 UTC is 8:00 AM in Manila (UTC+8, no summer time). */
const REFILL = "2026-10-26T00:00:00.000Z";

function energyLow(balance: number, price: number): ApiError {
  return new ApiError(429, "energy_low", { error: "energy_low", balance, price, nextRefillAt: REFILL });
}

describe("energy text", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "Asia/Manila");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("the refill time is the clock time in the time zone of the user", () => {
    expect(refillTimeText(REFILL)).toBe("8:00 AM");
  });

  it("an energy_low error on a reply gives the price, the balance and the refill time", () => {
    expect(energyLowText(energyLow(1.5, 2), "reply")).toBe("A reply costs 2 energy. You have 1.5. Your energy refills at 8:00 AM.");
  });

  it("an energy_low error on a scene image or a memory summary names that action", () => {
    expect(energyLowText(energyLow(3, 5), "scene")).toBe("A scene image costs 5 energy. You have 3. Your energy refills at 8:00 AM.");
    expect(energyLowText(energyLow(0.5, 1), "memory")).toBe(
      "A memory summary costs 1 energy. You have 0.5. Your energy refills at 8:00 AM.",
    );
  });

  it("a 429 with no energy_low, an energy_low with no body, and other errors give null", () => {
    expect(energyLowText(new ApiError(429, null), "reply")).toBeNull();
    expect(energyLowText(new ApiError(429, "energy_low"), "reply")).toBeNull();
    expect(energyLowText(new Error("network"), "scene")).toBeNull();
  });
});
