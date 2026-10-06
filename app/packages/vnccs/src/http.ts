export const DEFAULT_COMFY_URL = "http://127.0.0.1:8188";

const TRAILING_SLASHES = /\/+$/;
const SERVER_MEDIA_PATH = /^\/(?:vnccs\/|view\?)/;

export function trimTrailingSlashes(value: string): string {
  return value.replace(TRAILING_SLASHES, "");
}

export class VnccsRequestError extends Error {
  override readonly name = "VnccsRequestError";
  readonly data: unknown;
  readonly route: string;
  readonly status: number;

  constructor(route: string, status: number, message: string, data: unknown) {
    super(message);
    this.route = route;
    this.status = status;
    this.data = data;
  }
}

export type Query = Record<string, string | number | boolean | undefined>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function errorMessage(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data) {
    const { error } = data as { error: unknown };
    if (typeof error === "string" && error) {
      return error;
    }
  }
  return null;
}

/**
 * Transport for VNCCS routes on one ComfyUI. Routes go through ComfyUI's
 * `/api` prefix like the legacy widgets did. State-changing calls are trusted
 * by Origin (ComfyUI is started with `--enable-cors-header <app origin>`), so
 * no CSRF marker header is sent: ComfyUI's CORS preflight would reject it.
 */
export class VnccsHttp {
  readonly baseUrl: string;
  private readonly send: FetchLike;

  constructor(baseUrl: string, send?: FetchLike) {
    this.baseUrl = trimTrailingSlashes(baseUrl);
    this.send = send ?? ((input, init) => globalThis.fetch(input, init));
  }

  url(route: string, query?: Query): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }
    const suffix = search.size > 0 ? `?${search}` : "";
    return `${this.baseUrl}/api${route}${suffix}`;
  }

  /** Resolve a server-relative media path (as stored in widget state) to an absolute URL. */
  mediaUrl(value: string): string {
    if (!value) {
      return "";
    }
    if (value.startsWith("/api/")) {
      return `${this.baseUrl}${value}`;
    }
    if (SERVER_MEDIA_PATH.test(value)) {
      return `${this.baseUrl}/api${value}`;
    }
    return value;
  }

  async request<T>(
    route: string,
    init: RequestInit & { query?: Query } = {}
  ): Promise<T> {
    const { query, ...rest } = init;
    const response = await this.send(this.url(route, query), {
      cache: "no-store",
      ...rest,
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new VnccsRequestError(
        route,
        response.status,
        `Invalid server response (HTTP ${response.status})`,
        null
      );
    }
    const message = errorMessage(data);
    if (!response.ok || message) {
      throw new VnccsRequestError(
        route,
        response.status,
        message ?? `HTTP ${response.status}`,
        data
      );
    }
    return data as T;
  }

  get<T>(route: string, query?: Query): Promise<T> {
    return this.request<T>(route, { query });
  }

  post<T>(route: string, body: unknown = {}, query?: Query): Promise<T> {
    return this.request<T>(route, {
      method: "POST",
      query,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  postForm<T>(route: string, form: FormData): Promise<T> {
    return this.request<T>(route, { method: "POST", body: form });
  }
}
