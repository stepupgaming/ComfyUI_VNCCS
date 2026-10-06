import {
  fetchPresetCatalog,
  type PresetGroup,
  type PresetItem,
  type TraitField,
} from "./character-presets";
import { isModelFileError, type WizardFailure, wizardFailure } from "./creator";
import type { VnccsHttp } from "./http";
import { type ImageRef, uploadImage } from "./uploads";

/** REST calls and pure helpers of the Character Cloner widget (`web/vnccs_character_cloner.js`). */

export const CLONE_UPLOAD_PREFIX = "clone_source";

export const ONE_IMAGE_ONLY_MESSAGE =
  "Character Cloner accepts only one reference image. Select a single file; it will replace the current reference.";

/** Upload the reference image; the Cloner sends no extra form fields. */
export function uploadClonerSource(
  http: VnccsHttp,
  file: Blob & { name?: string }
): Promise<ImageRef> {
  return uploadImage(http, file, { prefix: CLONE_UPLOAD_PREFIX });
}

/** Read character traits off the reference image with the local Qwen3.5 vision model. */
export function analyzeClonerSource(
  http: VnccsHttp,
  image: ImageRef | string,
  nodeId: string
): Promise<Record<string, unknown>> {
  return http.post<Record<string, unknown>>("/vnccs/cloner_auto_generate", {
    image_name: image,
    node_id: nodeId,
  });
}

export const DEPENDENCY_HINT =
  "Correct 'llama-cpp-python' version required. Please install the JamePeng fork or a compatible version manually.";

export type AnalysisError =
  | { kind: "dependency"; message: string; model: string; title: string }
  | { failure: WizardFailure; kind: "model" }
  | { kind: "other"; message: string; title: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** How the widget reported a failed analysis: a dependency notice, a download offer, or the error. */
export function analysisError(error: unknown): AnalysisError {
  const failure = wizardFailure(error);
  if (failure?.code === "DEPENDENCY_MISSING") {
    return {
      kind: "dependency",
      title: "Dependency Missing",
      message: failure.message,
      model: failure.model,
    };
  }
  if (failure && isModelFileError(failure.code)) {
    return { kind: "model", failure };
  }
  return {
    kind: "other",
    title: "Error",
    message: `Auto-Gen Failed: ${failure?.message || errorText(error)}`,
  };
}

/** `/vnccs/get_tags`: the legacy Danbooru catalog in `character_template/character_tags.json`. */
export interface ClonerTagCatalog {
  tags?: {
    eyes?: {
      colors?: PresetItem[];
      face_characteristics?: PresetItem[];
      features?: PresetItem[];
    };
    [category: string]: unknown;
  };
}

const FIELD_CATEGORIES: Record<TraitField, string[]> = {
  hair: ["hair_color", "hairstyles"],
  eyes: ["eyes"],
  face: ["eyes"],
  race: ["races"],
  skin_color: ["skin_color"],
  body: ["breast_size"],
  additional_details: ["details"],
};

function items(value: unknown): PresetItem[] | null {
  return Array.isArray(value) ? (value as PresetItem[]) : null;
}

type EyeTags = NonNullable<ClonerTagCatalog["tags"]>["eyes"];

/** The `eyes` category feeds two rows: colors and features for Eyes, face characteristics for Face. */
function eyeGroups(eyes: EyeTags, field: TraitField): PresetGroup[] {
  const sources: [string, unknown][] =
    field === "eyes"
      ? [
          ["Eye Colors", eyes?.colors],
          ["Eye Features", eyes?.features],
        ]
      : [["Face Characteristics", eyes?.face_characteristics]];
  const groups: PresetGroup[] = [];
  for (const [header, value] of sources) {
    const data = items(value);
    if (data) {
      groups.push({ header, items: data });
    }
  }
  return groups;
}

/** The tag constructor's groups for one trait field. */
export function clonerTagGroups(
  catalog: ClonerTagCatalog | null | undefined,
  field: TraitField
): PresetGroup[] {
  const tags = catalog?.tags;
  const groups: PresetGroup[] = [];
  for (const category of FIELD_CATEGORIES[field] ?? []) {
    if (category === "eyes") {
      groups.push(...eyeGroups(tags?.eyes, field));
      continue;
    }
    const data = items(tags?.[category]);
    if (data) {
      // The widget replaced only the first underscore.
      groups.push({
        header: category.replace("_", " ").toUpperCase(),
        items: data,
      });
    }
  }
  return groups;
}

/**
 * The tag catalogs, loaded once: the legacy catalog, plus the Creator V2 skin
 * presets the first time the Skin row asks for them.
 */
export class ClonerTagLoader {
  private catalog: ClonerTagCatalog | null = null;
  private readonly http: () => VnccsHttp;

  constructor(http: () => VnccsHttp) {
    this.http = http;
  }

  async groups(field: TraitField): Promise<PresetGroup[]> {
    if (!this.catalog) {
      const loaded = await this.http().get<ClonerTagCatalog>("/vnccs/get_tags");
      this.catalog = { ...loaded, tags: { ...loaded?.tags } };
    }
    const tags = this.catalog.tags ?? {};
    if (field === "skin_color" && !items(tags.skin_color)) {
      const presets = await fetchPresetCatalog(this.http());
      this.catalog.tags = { ...tags, skin_color: presets.tags?.skin_color };
    }
    return clonerTagGroups(this.catalog, field);
  }
}
