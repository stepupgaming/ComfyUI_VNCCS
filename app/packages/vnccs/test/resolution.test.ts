import { describe, expect, it } from "vitest";
import {
  resolutionScaleMegapixels,
  resolutionScaleText,
  resolutionScaleValue,
  snapTargetSize,
} from "../src/resolution";

describe("resolution scale", () => {
  it("maps megapixels to pixel sizes with the 1.3 and 1.5 MP buckets", () => {
    expect(resolutionScaleValue(1)).toBe(1024);
    expect(resolutionScaleValue(1.3)).toBe(1344);
    expect(resolutionScaleValue(1.5)).toBe(1536);
    expect(resolutionScaleValue(2)).toBe(2048);
    expect(resolutionScaleValue(1.7)).toBe(1741);
  });

  it("clamps to 1-4 MP and treats junk as the minimum", () => {
    expect(resolutionScaleValue(0.2)).toBe(1024);
    expect(resolutionScaleValue(9)).toBe(4096);
    expect(resolutionScaleValue("bad")).toBe(1024);
    expect(resolutionScaleMegapixels(undefined)).toBe(1);
    expect(resolutionScaleMegapixels(8192)).toBe(4);
  });

  it("snaps stored sizes onto the slider grid", () => {
    expect(snapTargetSize(1344)).toBe(1344);
    expect(snapTargetSize(1536)).toBe(1536);
    expect(snapTargetSize(1100)).toBe(1126);
    expect(snapTargetSize(3072)).toBe(3072);
    expect(resolutionScaleText(1536)).toBe("1.5 MP");
  });
});
