import type { VnccsHttp } from "./http";

/** An image in ComfyUI's input/temp/output folders, as widgets store it. */
export interface ImageRef {
  name: string;
  subfolder: string;
  type: string;
}

const EXTENSION = /(\.[A-Za-z0-9]{1,8})$/;
const PATH_SEPARATORS = /[\\/]/g;
const LEADING_JUNK = /^[\s.-]+/;
const WHITESPACE = /\s+/g;
const UNSAFE = /[^A-Za-z0-9._-]/g;
const ALPHANUMERIC = /[A-Za-z0-9]/;

/**
 * The widgets' `normalizeUploadFile`: a file name ComfyUI stores as typed.
 * Any rewrite gets the prefix, so cleaned names cannot collide with real ones.
 */
export function normalizeUploadName(
  original: string,
  prefix = "vnccs_upload",
  now: number = Date.now()
): string {
  const trimmed = String(original || "").trim();
  const ext = trimmed.match(EXTENSION)?.[1] ?? ".png";
  let name = trimmed.replace(PATH_SEPARATORS, "_").trim();
  name = name.replace(LEADING_JUNK, "");
  name = name.replace(WHITESPACE, "_");
  name = name.replace(UNSAFE, "_");
  if (!(name && ALPHANUMERIC.test(name))) {
    name = `${prefix}_${now}${ext}`;
  }
  return name === trimmed ? name : `${prefix}_${name}`;
}

/** Saved references may be plain file names (older workflows) or `{name, type, subfolder}`. */
export function imageRef(value: unknown): ImageRef | null {
  if (typeof value === "string") {
    return value ? { name: value, type: "input", subfolder: "" } : null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (!name) {
      return null;
    }
    return {
      name,
      type:
        typeof record.type === "string" && record.type ? record.type : "input",
      subfolder: typeof record.subfolder === "string" ? record.subfolder : "",
    };
  }
  return null;
}

/** ComfyUI's `/view` URL for an image reference. */
export function viewUrl(http: VnccsHttp, value: unknown): string {
  const ref = imageRef(value);
  if (!ref) {
    return "";
  }
  return http.url("/view", {
    filename: ref.name,
    type: ref.type,
    subfolder: ref.subfolder || undefined,
  });
}

export interface UploadOptions {
  /** Extra form fields; the Clothes Designer sends `type=input` and `overwrite=true`. */
  fields?: Record<string, string>;
  /** Prefix for rewritten file names. */
  prefix: string;
}

/** Upload one image through ComfyUI's `/upload/image` route. */
export async function uploadImage(
  http: VnccsHttp,
  file: Blob & { name?: string },
  options: UploadOptions
): Promise<ImageRef> {
  const name = normalizeUploadName(file.name ?? "", options.prefix);
  const form = new FormData();
  form.append("image", file, name);
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.append(key, value);
  }
  const data = await http.postForm<{
    name?: unknown;
    subfolder?: unknown;
    type?: unknown;
  }>("/upload/image", form);
  if (typeof data.name !== "string" || !data.name) {
    throw new Error("Upload response did not include an image name.");
  }
  return {
    name: data.name,
    type: typeof data.type === "string" && data.type ? data.type : "input",
    subfolder: typeof data.subfolder === "string" ? data.subfolder : "",
  };
}
