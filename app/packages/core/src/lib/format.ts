const GIB = 1024 ** 3;

export function formatGiB(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GB`;
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}
