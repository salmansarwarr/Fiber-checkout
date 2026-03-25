import { describe, it, expect } from "vitest";
import {
  isHexString,
  toHex,
  toHexNumber,
  fromHex,
  fromHexNumber,
  ckbToShannon,
  shannonToCkb,
  ckbToShannonHex,
  shannonHexToCkb,
  formatAmount,
} from "../../utils/hex";

describe("isHexString()", () => {
  it("accepts valid hex strings", () => {
    expect(isHexString("0x0")).toBe(true);
    expect(isHexString("0x64")).toBe(true);
    expect(isHexString("0xdeadbeef")).toBe(true);
    expect(isHexString("0xDEADBEEF")).toBe(true);
    expect(isHexString("0x")).toBe(true);
  });

  it("rejects non-hex strings", () => {
    expect(isHexString("64")).toBe(false);
    expect(isHexString("0xgg")).toBe(false);
    expect(isHexString("")).toBe(false);
    expect(isHexString(123)).toBe(false);
    expect(isHexString(null)).toBe(false);
  });
});

describe("toHex()", () => {
  it("encodes bigint to hex", () => {
    expect(toHex(0n)).toBe("0x0");
    expect(toHex(100n)).toBe("0x64");
    expect(toHex(255n)).toBe("0xff");
    expect(toHex(100_000_000n)).toBe("0x5f5e100");
  });

  it("throws for negative values", () => {
    expect(() => toHex(-1n)).toThrow(RangeError);
  });
});

describe("toHexNumber()", () => {
  it("encodes number to hex", () => {
    expect(toHexNumber(0)).toBe("0x0");
    expect(toHexNumber(255)).toBe("0xff");
  });

  it("throws for negative numbers", () => {
    expect(() => toHexNumber(-1)).toThrow(RangeError);
  });

  it("throws for non-safe integers", () => {
    expect(() => toHexNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => toHexNumber(1.5)).toThrow(RangeError);
  });
});

describe("fromHex()", () => {
  it("decodes hex to bigint", () => {
    expect(fromHex("0x0")).toBe(0n);
    expect(fromHex("0x64")).toBe(100n);
    expect(fromHex("0x5f5e100")).toBe(100_000_000n);
  });

  it("handles 0x empty string as 0", () => {
    expect(fromHex("0x")).toBe(0n);
  });

  it("throws for invalid hex", () => {
    expect(() => fromHex("64" as any)).toThrow(TypeError);
  });
});

describe("fromHexNumber()", () => {
  it("decodes hex to number", () => {
    expect(fromHexNumber("0x64")).toBe(100);
    expect(fromHexNumber("0x5f5e100")).toBe(100_000_000);
  });

  it("throws for values exceeding MAX_SAFE_INTEGER", () => {
    const tooBig = toHex(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    expect(() => fromHexNumber(tooBig)).toThrow(RangeError);
  });
});

describe("ckbToShannon()", () => {
  it("converts whole CKB", () => {
    expect(ckbToShannon(1)).toBe(100_000_000n);
    expect(ckbToShannon(10)).toBe(1_000_000_000n);
  });

  it("converts fractional CKB", () => {
    expect(ckbToShannon(0.5)).toBe(50_000_000n);
    expect(ckbToShannon(0.00000001)).toBe(1n);
  });

  it("converts zero", () => {
    expect(ckbToShannon(0)).toBe(0n);
  });

  it("throws for negative", () => {
    expect(() => ckbToShannon(-1)).toThrow(RangeError);
  });
});

describe("shannonToCkb()", () => {
  it("converts shannons to CKB", () => {
    expect(shannonToCkb(100_000_000n)).toBe(1);
    expect(shannonToCkb(50_000_000n)).toBe(0.5);
    expect(shannonToCkb(0n)).toBe(0);
  });
});

describe("ckbToShannonHex()", () => {
  it("converts 1 CKB to 0x5f5e100", () => {
    expect(ckbToShannonHex(1)).toBe("0x5f5e100");
  });

  it("converts 100 CKB", () => {
    expect(ckbToShannonHex(100)).toBe("0x2540be400");
  });
});

describe("shannonHexToCkb()", () => {
  it("converts 0x5f5e100 to 1 CKB", () => {
    expect(shannonHexToCkb("0x5f5e100")).toBe(1);
  });
});

describe("formatAmount()", () => {
  it("formats CKB amount", () => {
    expect(formatAmount("0x5f5e100", "CKB")).toBe("1 CKB");
  });

  it("formats RUSD amount", () => {
    expect(formatAmount("0x5f5e100", "RUSD")).toBe("1 RUSD");
  });

  it("trims trailing zeros", () => {
    expect(formatAmount("0x5f5e100", "CKB")).toBe("1 CKB");
    expect(formatAmount("0x2faf080", "CKB")).toBe("0.5 CKB");
  });
});