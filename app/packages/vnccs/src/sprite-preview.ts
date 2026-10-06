import { normalizeSpriteIndex } from "./creator";
import { type VnccsHttp, VnccsRequestError } from "./http";

/**
 * The widgets' `createSpritePreviewNavigator` (`web/vnccs_common.js`): steps
 * through a character's saved pose sprites, falling back to another preview
 * when there are none. Each load or step invalidates older image loads.
 */

export interface SpritePreviewState {
  cacheBust: string;
  character: string;
  costume: string;
  count: number;
  fallbackUrl: string;
  index: number;
  loading: boolean;
  /** The image on screen; null shows the placeholder. */
  url: string | null;
}

export interface SpritePreviewSelection {
  character: string;
  costume: string;
}

export interface SpritePreviewOptions {
  /** The REST client; read on every request so a changed ComfyUI URL applies. */
  http: () => VnccsHttp;
  /** Whether the navigator's selection still matches the page (stale loads are dropped). */
  isSelectionCurrent?: (selection: SpritePreviewSelection) => boolean;
  now?: () => number;
  onChange?: (state: SpritePreviewState) => void;
  onError?: (state: SpritePreviewState) => void;
  onLoaded?: (url: string, state: SpritePreviewState) => void;
  onMissing?: (state: SpritePreviewState) => void;
  prefetch?: (url: string) => void;
  /** Resolves true once the image loaded, false when it failed. */
  probe: (url: string) => Promise<boolean>;
  random?: () => number;
}

export interface SpritePreviewLoad {
  costume?: string;
  fallbackUrl?: string;
  index?: number;
  random?: boolean;
}

export function spriteNavVisible(state: SpritePreviewState): boolean {
  return state.count > 1;
}

export function spriteNavLabel(state: SpritePreviewState): string {
  return spriteNavVisible(state) ? `${state.index + 1}/${state.count}` : "";
}

export function emptySpritePreview(): SpritePreviewState {
  return {
    cacheBust: "",
    character: "",
    costume: "",
    count: 0,
    fallbackUrl: "",
    index: 0,
    loading: false,
    url: null,
  };
}

export class SpritePreviewNavigator {
  private readonly options: SpritePreviewOptions;
  private disposed = false;
  private requestId = 0;
  private current: SpritePreviewState = emptySpritePreview();

  constructor(options: SpritePreviewOptions) {
    this.options = options;
  }

  get state(): SpritePreviewState {
    return this.current;
  }

  private update(patch: Partial<SpritePreviewState>): void {
    this.current = { ...this.current, ...patch };
    this.options.onChange?.(this.current);
  }

  private selectionCurrent(selection: SpritePreviewSelection): boolean {
    return this.options.isSelectionCurrent?.(selection) ?? true;
  }

  private isCurrent(requestId: number): boolean {
    return (
      !this.disposed &&
      requestId === this.requestId &&
      this.selectionCurrent(this.current)
    );
  }

  private nextRequest(): number {
    this.requestId += 1;
    return this.requestId;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  spriteUrl(character: string, index: number, costume = ""): string {
    return this.options.http().url("/vnccs/get_character_pose_preview", {
      character,
      index,
      v: this.current.cacheBust || "current",
      costume: costume || undefined,
    });
  }

  /** Drop every pending load, like the widgets' `invalidate()`. */
  invalidate(): void {
    this.requestId += 1;
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }

  hideNav(): void {
    this.update({ count: 0, index: 0 });
  }

  private applyImage(url: string): void {
    this.update({ loading: false, url });
    this.options.onLoaded?.(url, this.current);
  }

  private applyMissing(): void {
    this.update({ count: 0, index: 0, loading: false, url: null });
    this.options.onMissing?.(this.current);
  }

  private prefetch(index: number): void {
    const { character, costume, count } = this.current;
    if (!character || count <= 1 || !this.options.prefetch) {
      return;
    }
    this.options.prefetch(
      this.spriteUrl(character, normalizeSpriteIndex(index, count), costume)
    );
  }

  /** Show a non-sprite preview (cached render, costume preview) or the placeholder. */
  async showFallback(
    rawUrl: string,
    selection: Partial<SpritePreviewSelection> = {}
  ): Promise<void> {
    const url = this.options.http().mediaUrl(rawUrl);
    const character = selection.character ?? this.current.character;
    const costume = selection.costume ?? this.current.costume;
    if (this.disposed || !this.selectionCurrent({ character, costume })) {
      return;
    }
    this.current = { ...this.current, character, costume };
    const requestId = this.nextRequest();
    if (!url) {
      this.applyMissing();
      return;
    }
    this.update({ count: 0, index: 0, loading: true });
    const loaded = await this.options.probe(url);
    if (!this.isCurrent(requestId)) {
      return;
    }
    if (loaded) {
      this.applyImage(url);
    } else {
      this.applyMissing();
    }
  }

  /** Step to a sprite; wraps in both directions. */
  async show(index: number): Promise<void> {
    if (this.disposed || !this.selectionCurrent(this.current)) {
      return;
    }
    const { character, costume, count } = this.current;
    if (!character || count <= 0) {
      return;
    }
    const normalized = normalizeSpriteIndex(index, count);
    const url = this.spriteUrl(character, normalized, costume);
    const requestId = this.nextRequest();
    this.update({ index: normalized, loading: true });
    const loaded = await this.options.probe(url);
    if (!this.isCurrent(requestId)) {
      return;
    }
    if (!loaded) {
      this.update({ loading: false });
      const fallback = this.showFallback(this.current.fallbackUrl);
      this.options.onError?.(this.current);
      await fallback;
      return;
    }
    this.applyImage(url);
    this.prefetch(normalized - 1);
    this.prefetch(normalized + 1);
  }

  step(delta: number): Promise<void> {
    return this.show(this.current.index + delta);
  }

  /** Load a character's sprites: a random one by default, else the fallback. */
  async load(
    character: string,
    options: SpritePreviewLoad = {}
  ): Promise<void> {
    if (this.disposed) {
      return;
    }
    const http = this.options.http();
    const name = character || "";
    const costume = options.costume || "";
    this.current = {
      ...this.current,
      character: name,
      costume,
      fallbackUrl: http.mediaUrl(options.fallbackUrl || ""),
      cacheBust: `${name}:${costume}:${this.now()}`,
    };
    const requestId = this.nextRequest();
    if (!name) {
      this.applyMissing();
      return;
    }
    this.update({ loading: true });
    let count = 0;
    try {
      const meta = await http.get<{ count?: unknown }>(
        "/vnccs/get_character_pose_preview_meta",
        { character: name, t: this.now(), costume: costume || undefined }
      );
      count = Number(meta?.count || 0);
    } catch (error) {
      // An HTTP error status reads as "no sprites"; anything else is reported.
      const httpStatus =
        error instanceof VnccsRequestError && error.status >= 400;
      if (!this.isCurrent(requestId)) {
        return;
      }
      if (!httpStatus) {
        this.update({ loading: false });
        const fallback = this.showFallback(this.current.fallbackUrl);
        this.options.onError?.(this.current);
        await fallback;
        return;
      }
    }
    if (!this.isCurrent(requestId)) {
      return;
    }
    this.current = { ...this.current, count };
    if (count <= 0) {
      this.update({ loading: false });
      await this.showFallback(this.current.fallbackUrl);
      return;
    }
    const random = options.random ?? true;
    const start = random
      ? Math.floor((this.options.random ?? Math.random)() * count)
      : (options.index ?? 0);
    await this.show(start);
  }
}
