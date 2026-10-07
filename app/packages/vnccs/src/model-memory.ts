import { type VnccsHttp, VnccsRequestError } from "./http";

/**
 * When the studio frees the models ComfyUI holds for it (`nodes/studio_memory.py`).
 * "gpu" frees VRAM but keeps RAM copies, so previews and Regenerate stay fast;
 * "all" also drops those copies and the Regenerate contexts.
 */
export type MemoryScope = "gpu" | "all";

export const RELEASE_MEMORY_ROUTE = "/vnccs/studio/release_memory";

/** Ask VNCCS to free its models. Resolves false while a generation still runs. */
export async function releaseModelMemory(
  http: VnccsHttp,
  scope: MemoryScope
): Promise<boolean> {
  try {
    await http.post(RELEASE_MEMORY_ROUTE, { scope });
    return true;
  } catch (error) {
    if (error instanceof VnccsRequestError && error.status === 409) {
      return false;
    }
    throw error;
  }
}

/**
 * The wizards run llama.cpp inside ComfyUI and free it when they finish, so
 * they only need the VRAM the diffusion models occupy, not a full release.
 */
export const WIZARD_FAMILY = "wizard";

/** Idle minutes before each release; 0 disables it. */
export interface IdleLimits {
  allMinutes: number;
  gpuMinutes: number;
}

export interface ModelMemoryOptions {
  idleLimits: () => IdleLimits;
  release: (scope: MemoryScope) => Promise<boolean>;
  /** Run `callback` after `ms`; returns a cancel function. */
  schedule?: (callback: () => void, ms: number) => () => void;
}

const MINUTE_MS = 60_000;

function defaultSchedule(callback: () => void, ms: number): () => void {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
}

/**
 * Decides when the studio's models leave ComfyUI: before work for another
 * model family, after the studio has been idle, and on demand (app close).
 * A release is skipped while other studio work runs, because the server
 * would refuse it or unload that work's models.
 */
export class ModelMemory {
  private active = 0;
  private cancels: (() => void)[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  /** The family whose models ComfyUI may still hold; null after a full release. */
  private family: string | null = null;
  /** Whether VRAM may hold models. */
  private onGpu = false;
  private readonly options: ModelMemoryOptions;

  constructor(options: ModelMemoryOptions) {
    this.options = options;
  }

  /** Run model work for one family; `family` "" means unknown and never triggers a release. */
  async run<T>(family: string, task: () => Promise<T>): Promise<T> {
    this.active += 1;
    this.stopTimers();
    try {
      await this.serial(() => this.prepare(family));
      return await task();
    } finally {
      this.active -= 1;
      this.armTimers();
    }
  }

  /** Something outside tracked work may have loaded models (Pose Studio, a reconnect). */
  touch(): void {
    this.onGpu = true;
    this.armTimers();
  }

  /** Release everything now. Resolves false while work still runs. */
  releaseAll(): Promise<boolean> {
    this.stopTimers();
    return this.serial(() => this.release("all"));
  }

  /** Stop the idle timers, e.g. when the studio unmounts. */
  dispose(): void {
    this.stopTimers();
  }

  private serial<T>(step: () => Promise<T>): Promise<T> {
    const next = this.chain.then(step);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async prepare(family: string): Promise<void> {
    const othersRunning = this.active > 1;
    if (family === WIZARD_FAMILY) {
      if (this.onGpu && !othersRunning) {
        await this.release("gpu");
      }
      return;
    }
    if (family && this.family && this.family !== family && !othersRunning) {
      await this.release("all");
    }
    if (family) {
      this.family = family;
    }
    this.onGpu = true;
  }

  private async release(scope: MemoryScope): Promise<boolean> {
    let released: boolean;
    try {
      released = await this.options.release(scope);
    } catch {
      released = false;
    }
    if (released) {
      this.onGpu = false;
      if (scope === "all") {
        this.family = null;
      }
    }
    return released;
  }

  private armTimers(): void {
    this.stopTimers();
    if (this.active > 0) {
      return;
    }
    const { allMinutes, gpuMinutes } = this.options.idleLimits();
    const schedule = this.options.schedule ?? defaultSchedule;
    if (gpuMinutes > 0) {
      this.cancels.push(
        schedule(() => this.idle("gpu"), gpuMinutes * MINUTE_MS)
      );
    }
    if (allMinutes > 0) {
      this.cancels.push(
        schedule(() => this.idle("all"), allMinutes * MINUTE_MS)
      );
    }
  }

  private stopTimers(): void {
    for (const cancel of this.cancels) {
      cancel();
    }
    this.cancels = [];
  }

  private idle(scope: MemoryScope): void {
    if (this.active > 0) {
      return;
    }
    const needed =
      scope === "gpu" ? this.onGpu : this.onGpu || this.family !== null;
    if (needed) {
      this.serial(() => this.release(scope));
    }
  }
}
