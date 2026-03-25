import { describe, it, expect } from "vitest";
import { generatePreimage, isValidPreimage } from "../../utils/preimage";

describe("generatePreimage()", () => {
  it("returns a 0x-prefixed string", () => {
    expect(generatePreimage()).toMatch(/^0x/);
  });

  it("returns exactly 66 characters (0x + 64 hex chars)", () => {
    expect(generatePreimage()).toHaveLength(66);
  });

  it("returns only hex characters after 0x", () => {
    const preimage = generatePreimage();
    expect(preimage.slice(2)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique values each call", () => {
    const a = generatePreimage();
    const b = generatePreimage();
    expect(a).not.toBe(b);
  });

  it("generates 100 unique values with no collisions", () => {
    const set = new Set(Array.from({ length: 100 }, generatePreimage));
    expect(set.size).toBe(100);
  });
});

describe("isValidPreimage()", () => {
  it("accepts a valid 32-byte hex preimage", () => {
    const preimage = generatePreimage();
    expect(isValidPreimage(preimage)).toBe(true);
  });

  it("accepts manually constructed valid preimage", () => {
    expect(isValidPreimage("0x" + "ab".repeat(32))).toBe(true);
  });

  it("rejects too-short preimage", () => {
    expect(isValidPreimage("0xdeadbeef")).toBe(false);
  });

  it("rejects too-long preimage", () => {
    expect(isValidPreimage("0x" + "ab".repeat(33))).toBe(false);
  });

  it("rejects missing 0x prefix", () => {
    expect(isValidPreimage("ab".repeat(32))).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidPreimage("0x" + "zz".repeat(32))).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidPreimage(null)).toBe(false);
    expect(isValidPreimage(123)).toBe(false);
    expect(isValidPreimage(undefined)).toBe(false);
  });
});