/**
 * The megapixel "resolution scale" shared by the Creator and the generators.
 * Values are stored as a target size in pixels (1 MP = 1024); 1.3 and 1.5 MP
 * map to the bucket sizes the models were trained on instead.
 */
export const RESOLUTION_SCALE = {
  base: 1024,
  minMp: 1,
  maxMp: 4,
  stepMp: 0.1,
} as const;

const PRESETS = new Map([
  [1.3, 1344],
  [1.5, 1536],
]);

function clampMp(megapixels: number): number {
  return Math.max(
    RESOLUTION_SCALE.minMp,
    Math.min(RESOLUTION_SCALE.maxMp, megapixels)
  );
}

export function resolutionScaleMegapixels(value: unknown): number {
  const numeric = Number(value);
  return clampMp(
    Number.isFinite(numeric)
      ? numeric / RESOLUTION_SCALE.base
      : RESOLUTION_SCALE.minMp
  );
}

export function resolutionScaleValue(megapixels: unknown): number {
  const numeric = Number(megapixels);
  const clamped = clampMp(
    Number.isFinite(numeric) ? numeric : RESOLUTION_SCALE.minMp
  );
  const stepped = Number(
    (
      Math.round(clamped / RESOLUTION_SCALE.stepMp) * RESOLUTION_SCALE.stepMp
    ).toFixed(1)
  );
  return PRESETS.get(stepped) ?? Math.round(stepped * RESOLUTION_SCALE.base);
}

export function resolutionScaleText(value: unknown): string {
  return `${resolutionScaleMegapixels(value).toFixed(1)} MP`;
}

/** Snap a stored target size onto the slider's grid. */
export function snapTargetSize(value: unknown): number {
  return resolutionScaleValue(resolutionScaleMegapixels(value));
}
