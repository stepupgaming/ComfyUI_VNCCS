import { studioHttp } from "@workspace/core/lib/studio";
import {
  SpritePreviewNavigator,
  type SpritePreviewOptions,
} from "@workspace/vnccs/sprite-preview";

/** Resolves once the browser loaded the image, or failed to. */
export function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

export function prefetchImage(url: string): void {
  const image = new Image();
  image.src = url;
}

/** A sprite navigator on the configured ComfyUI that loads images through the browser. */
export function createSpritePreview(
  options: Omit<SpritePreviewOptions, "http" | "prefetch" | "probe">
): SpritePreviewNavigator {
  return new SpritePreviewNavigator({
    ...options,
    http: studioHttp,
    prefetch: prefetchImage,
    probe: probeImage,
  });
}
