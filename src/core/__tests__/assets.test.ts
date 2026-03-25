import { describe, it, expect } from "vitest";
import { ASSETS, getAsset, isUdtAsset } from "../assets";

describe("ASSETS registry", () => {
  it("contains CKB with no UDT script", () => {
    expect(ASSETS.CKB.udtTypeScript).toBeNull();
    expect(ASSETS.CKB.symbol).toBe("CKB");
    expect(ASSETS.CKB.decimals).toBe(8);
  });

  it("contains RUSD with a UDT script", () => {
    expect(ASSETS.RUSD.udtTypeScript).not.toBeNull();
    expect(ASSETS.RUSD.symbol).toBe("RUSD");
    expect(ASSETS.RUSD.decimals).toBe(8);
  });

  it("RUSD script has correct testnet code_hash", () => {
    expect(ASSETS.RUSD.udtTypeScript?.code_hash).toBe(
      "0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a"
    );
  });

  it("RUSD script has correct args", () => {
    expect(ASSETS.RUSD.udtTypeScript?.args).toBe(
      "0x878fcc6f1f08d48e87bb1c3b3d5083f23f8a39c5d5c764f253b55b998526439b"
    );
  });
});

describe("getAsset()", () => {
  it("returns CKB config", () => {
    expect(getAsset("CKB").symbol).toBe("CKB");
  });

  it("returns RUSD config", () => {
    expect(getAsset("RUSD").symbol).toBe("RUSD");
  });
});

describe("isUdtAsset()", () => {
  it("returns false for CKB", () => {
    expect(isUdtAsset(ASSETS.CKB)).toBe(false);
  });

  it("returns true for RUSD", () => {
    expect(isUdtAsset(ASSETS.RUSD)).toBe(true);
  });
});