import {
  generatorData,
  prepareGeneratorRun,
  syncGenerator,
} from "@workspace/core/lib/generator-actions";
import { createSpritePreview } from "@workspace/core/lib/images";
import { runPrompt } from "@workspace/core/lib/jobs";
import { studioHttp } from "@workspace/core/lib/studio";
import {
  currentEmotionModel,
  emotionContext,
  useEmotionStore,
} from "@workspace/core/stores/emotion-store";
import {
  type GeneratorTarget,
  useGeneratorStore,
} from "@workspace/core/stores/generator-store";
import { nativeSeedvrProblem } from "@workspace/vnccs/character-generator";
import { fetchContextLists } from "@workspace/vnccs/creator";
import {
  addEmotionEntry,
  initializeEmotionStudioState,
  parseEmotionStudioState,
} from "@workspace/vnccs/emotion-state";
import {
  addCustomEmotion,
  type CustomEmotionInput,
  fetchCharacterCostumes,
  fetchCharacters,
  fetchEmotions,
  PLACEHOLDER_CHARACTER,
} from "@workspace/vnccs/emotions";
import { buildEmotionPrompt, EMOTION_IDS } from "@workspace/vnccs/graphs";
import type { SpritePreviewNavigator } from "@workspace/vnccs/sprite-preview";
import { toast } from "sonner";

/**
 * The Emotion Studio widget's async flows (init, character and costume
 * loading, the character list refresh, custom emotions, queueing), ported
 * from `web/vnccs_emotion_v2.js`. Each flow takes a request guard so a newer
 * request makes older replies stale, like the widget's fetch tokens.
 */

function requestGuard() {
  let current = 0;
  return () => {
    current += 1;
    const id = current;
    return () => id === current;
  };
}

const beginCharacterRequest = requestGuard();
const beginListRequest = requestGuard();

export const EMOTIONS_GENERATOR: GeneratorTarget = {
  kind: "emotions",
  nodeId: EMOTION_IDS.generator,
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function store() {
  return useEmotionStore.getState();
}

function currentCharacter(): string {
  return store().state?.character ?? "";
}

let navigator: SpritePreviewNavigator | null = null;

/** The character preview (no costume); its sprite count drives the pose chips. */
function spritePreview(): SpritePreviewNavigator {
  navigator ??= createSpritePreview({
    isSelectionCurrent: (selection) =>
      selection.character === currentCharacter(),
    onChange: (preview) => store().set({ preview }),
    onLoaded: (_url, preview) => {
      store().set({ poseCount: Math.max(0, Number(preview.count || 0)) });
      store().update((model) => model.trimPoseSelection());
    },
    onMissing: () => {
      store().set({ poseCount: 0 });
      store().update(() => undefined);
    },
  });
  return navigator;
}

export function stepSprite(delta: number): void {
  spritePreview().step(delta);
}

/** `node.onRemoved`: replies to anything started on the page are dropped. */
export function leaveEmotions(): void {
  beginCharacterRequest();
  beginListRequest();
  navigator?.invalidate();
}

/** `fetchCharacterData`: the preview and pose count, then the costume list. */
async function fetchCharacterData(name: string): Promise<void> {
  const isCurrentRequest = beginCharacterRequest();
  const preview = spritePreview();
  preview.invalidate();
  if (!name || name === PLACEHOLDER_CHARACTER) {
    store().set({ costumes: [] });
    await preview.load("");
    return;
  }
  preview.load(name);
  try {
    const costumes = await fetchCharacterCostumes(studioHttp(), name);
    if (!isCurrentRequest() || currentCharacter() !== name) {
      return;
    }
    store().set({ costumes });
    store().update((model) => model.applyCostumeList(costumes));
  } catch (error) {
    if (isCurrentRequest()) {
      toast.error("Could not load costumes", {
        description: errorText(error),
      });
    }
  }
}

/** The character select: another character clears the emotion and pose picks. */
export function selectCharacter(name: string): void {
  if (name !== currentCharacter()) {
    store().set({ poseCount: 0 });
  }
  store().update((model) => model.selectCharacter(name));
  fetchCharacterData(name);
}

/**
 * `refreshCharacterList`: re-read the saved characters (the select does
 * this on focus). A selection that no longer exists moves to the first
 * character without clearing the picks, as in the widget.
 */
export async function refreshCharacterList(
  options: { fetchData?: boolean } = {}
): Promise<void> {
  const isCurrentRequest = beginListRequest();
  const characters = await fetchCharacters(studioHttp()).catch(() => null);
  if (!(characters && isCurrentRequest() && store().state)) {
    return;
  }
  const before = currentCharacter();
  const selected = characters.includes(before) ? before : characters[0] || "";
  store().set({ characters });
  if (selected !== before) {
    store().update((model) => {
      model.state.character = selected;
    });
  }
  if (options.fetchData || selected !== before) {
    await fetchCharacterData(selected);
  }
}

/** The widget's init: lists and emotions, the saved state, then the selected character. */
export async function initEmotions(): Promise<void> {
  const http = studioHttp();
  beginListRequest();
  try {
    const [lists, emotions, characters] = await Promise.all([
      fetchContextLists(http),
      fetchEmotions(http),
      fetchCharacters(http),
    ]);
    store().set({ characters, emotions, lists, loadError: null });
    const state = parseEmotionStudioState(store().widgetData);
    store().setState(
      initializeEmotionStudioState(state, emotionContext(), lists)
    );
    const saved = currentCharacter();
    const selected = characters.includes(saved) ? saved : characters[0] || "";
    if (selected !== saved) {
      store().update((model) => {
        model.state.character = selected;
      });
    }
    await fetchCharacterData(selected);
  } catch (error) {
    store().set({ loadError: errorText(error) });
  }
}

/** What rendering the model cards wrote back once the catalog arrived. */
export function syncEmotionCatalogDefaults(): void {
  store().update(() => undefined);
}

/** Add Custom Emotion: save it on the server, then list and select it. */
export async function saveCustomEmotion(
  input: CustomEmotionInput
): Promise<void> {
  const emotion = await addCustomEmotion(studioHttp(), input);
  store().set({ emotions: addEmotionEntry(store().emotions, emotion) });
  store().update((model) => model.selectEmotions([emotion.safe_name]));
}

/**
 * Queue Step 3 (Emotion Studio → Emotions Generator), with the checks the
 * widget ran before ComfyUI's queue. Resolves true once the run finished.
 */
export async function queueEmotions(): Promise<boolean> {
  if (!store().state) {
    toast.error("Emotion Studio not ready", {
      description: "Wait for the Emotion Studio to load.",
    });
    return false;
  }
  // The widget randomized the seed before its checks could block the run.
  store().update((model) => {
    model.randomizeSeedIfNeeded();
  });
  const model = currentEmotionModel();
  if (!model) {
    return false;
  }
  const problem = model.queueProblem();
  if (problem) {
    toast.error(problem.title, { description: problem.message });
    return false;
  }
  syncGenerator(EMOTIONS_GENERATOR, model.generatorSources());
  const seedvrProblem = nativeSeedvrProblem(
    generatorData(EMOTIONS_GENERATOR),
    useGeneratorStore.getState().schemas
  );
  if (seedvrProblem) {
    toast.error("ComfyUI Update Required", { description: seedvrProblem });
    return false;
  }
  const prompt = buildEmotionPrompt({
    source: model.sourceInputs(),
    generator: { widgetData: prepareGeneratorRun(EMOTIONS_GENERATOR) },
  });
  try {
    await runPrompt(`Emotions · ${model.state.character}`, prompt);
    return true;
  } catch (error) {
    toast.error("Run failed", { description: errorText(error) });
    return false;
  }
}
