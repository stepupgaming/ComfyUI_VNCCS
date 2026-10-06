"use client";

import type { ComponentProps } from "react";

/**
 * An image ComfyUI serves (previews, sprites, stage results). The app is a
 * static export, so next/image cannot optimize these URLs.
 */
export function RemoteImage({
  alt = "",
  decoding = "async",
  height,
  width,
  ...props
}: ComponentProps<"img">) {
  return (
    // biome-ignore lint/performance/noImgElement: ComfyUI-served media in a static export
    <img
      alt={alt}
      decoding={decoding}
      height={height}
      width={width}
      {...props}
    />
  );
}
