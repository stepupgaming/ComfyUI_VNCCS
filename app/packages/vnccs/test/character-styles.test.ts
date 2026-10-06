import { describe, expect, it } from "vitest";
import {
  applyStyle,
  CUSTOM_STYLE_ID,
  defaultStyleId,
  EMPTY_STYLE_CATALOG,
  resolveStyleId,
  type StyleCatalog,
  stylePreviewPath,
  styleSummary,
} from "../src/character-styles";

function catalog(): StyleCatalog {
  return {
    default_style: "legacy",
    aliases: { old_ink: "legacy" },
    custom_preview: "/vnccs/character_styles/preview?style=custom&v=1",
    groups: [
      {
        label: "Anime",
        styles: [
          {
            id: "legacy",
            label: "Legacy",
            prompt: "legacy style",
            description: "Clean cel shading",
            reference: "VNCCS",
            image: "/vnccs/character_styles/preview?style=legacy&v=1",
          },
          { id: "ink", label: "Ink", prompt: "ink lines" },
        ],
      },
    ],
  };
}

describe("character styles", () => {
  it("defaults to the catalog style, or custom without a catalog", () => {
    expect(defaultStyleId(catalog())).toBe("legacy");
    expect(defaultStyleId(EMPTY_STYLE_CATALOG)).toBe(CUSTOM_STYLE_ID);
    expect(resolveStyleId(catalog(), "")).toBe("legacy");
  });

  it("follows aliases to the surviving style", () => {
    expect(resolveStyleId(catalog(), "old_ink")).toBe("legacy");
    const fields = applyStyle(catalog(), { style: "ink" }, "old_ink");
    expect(fields).toMatchObject({
      style: "legacy",
      style_prompt: "legacy style",
      style_label: "Legacy",
    });
  });

  it("copies the style text so a workflow keeps rendering it", () => {
    const fields = applyStyle(catalog(), { custom_style: "keep" }, "ink");
    expect(fields).toEqual({
      custom_style: "keep",
      style: "ink",
      style_prompt: "ink lines",
      style_label: "Ink",
      style_description: "",
      style_reference: "",
    });
  });

  it("summarizes an unavailable style from its saved copy", () => {
    const saved = {
      style: "gone",
      style_label: "Gone",
      style_description: "Was removed",
    };
    expect(styleSummary(catalog(), saved)).toEqual({
      label: "Gone",
      description: "Was removed",
      reference: "Not specified",
      image: "",
    });
    expect(styleSummary(catalog(), { style: "gone" }).label).toBe(
      "Unavailable style"
    );
  });

  it("describes the custom style with its preview", () => {
    expect(styleSummary(catalog(), { style: CUSTOM_STYLE_ID })).toMatchObject({
      label: "Custom style",
      reference: "Your prompt",
      image: "/vnccs/character_styles/preview?style=custom&v=1",
    });
  });

  it("trusts previews only from the preview route", () => {
    expect(
      stylePreviewPath({ image: "/vnccs/character_styles/preview?style=a" })
    ).toBe("/vnccs/character_styles/preview?style=a");
    expect(stylePreviewPath({ image: "https://example.com/x.png" })).toBeNull();
    expect(stylePreviewPath({})).toBeNull();
  });
});
