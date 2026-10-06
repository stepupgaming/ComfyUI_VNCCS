import type { QwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import { currentPoseData } from "@workspace/core/hooks/use-pose-studio";
import {
  type GeneratorSources,
  generatorData,
  prepareGeneratorRun,
  syncGenerator,
} from "@workspace/core/lib/generator-actions";
import { createSpritePreview } from "@workspace/core/lib/images";
import { runPrompt } from "@workspace/core/lib/jobs";
import { studioHttp } from "@workspace/core/lib/studio";
import {
  mirrorClothesSnapshot,
  useClothesStore,
} from "@workspace/core/stores/clothes-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  type GeneratorTarget,
  useGeneratorStore,
} from "@workspace/core/stores/generator-store";
import { usePoseStudioStore } from "@workspace/core/stores/pose-studio-store";
import { nativeSeedvrProblem } from "@workspace/vnccs/character-generator";
import {
  type ClothesControlCenter,
  ClothesSession,
  type CostumeTicket,
  type DeleteResult,
} from "@workspace/vnccs/clothes";
import {
  clothesContext,
  serializeClothesState,
} from "@workspace/vnccs/clothes-state";
import {
  isModelFileError,
  type WizardFailure,
  wizardFailure,
} from "@workspace/vnccs/creator";
import { buildClothesPrompt, CLOTHES_IDS } from "@workspace/vnccs/graphs";
import { toast } from "sonner";

/**
 * The page side of the Clothes Designer: one session for the app's lifetime
 * (its state survives leaving the page, like a node on the canvas), mirrored
 * into the store, plus the queued Step 2 run.
 */

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function controlCenter(): ClothesControlCenter {
  const { catalog, nodeState, repoId } = useControlCenterStore.getState();
  return { context: clothesContext(nodeState, catalog), nodeState, repoId };
}

let session: ClothesSession | null = null;

export function clothesSession(): ClothesSession {
  session ??= new ClothesSession({
    controlCenter,
    createNavigator: (hooks) => createSpritePreview(hooks),
    http: studioHttp,
    notify: (title, message, level) => {
      if (level === "warning") {
        toast.warning(title, { description: message });
      } else {
        toast.error(title, { description: message });
      }
    },
    onChange: mirrorClothesSnapshot,
  });
  return session;
}

export function initClothes(): Promise<void> {
  return clothesSession().init(useClothesStore.getState().widgetData);
}

/** `node.onRemoved`: pending replies are dropped; the designer keeps its state. */
export function leaveClothes(): void {
  session?.leave();
}

/**
 * The widget's `vnccs-lora-options-updated` and
 * `vnccs-control-center-model-changed` listeners: Clothes Core and the
 * background follow the Control Center.
 */
export function watchClothesControlCenter(): () => void {
  let { catalog, nodeState } = useControlCenterStore.getState();
  return useControlCenterStore.subscribe((next) => {
    if (next.catalog !== catalog || next.nodeState !== nodeState) {
      ({ catalog, nodeState } = next);
      session?.syncControlCenter();
    }
  });
}

/** Keeps the Pose Studio mannequin on the selected character's age and sex. */
export function syncClothesMannequin(age: unknown, sex: unknown): void {
  usePoseStudioStore
    .getState()
    .setCharacter({ age: Number(age) || 18, sex: String(sex || "female") });
}

// --- Costume dialogs ----------------------------------------------------------------

/** The confirmed DELETE; warnings about leftover files show as a notice. */
export async function confirmCostumeDelete(
  ticket: CostumeTicket
): Promise<DeleteResult> {
  const result = await clothesSession().confirmDelete(ticket);
  if (result.status === "deleted" && result.warning) {
    toast.warning("Costume Deleted", { description: result.warning });
  }
  return result;
}

export type WizardPhase = "checking" | "thinking";

const DEPENDENCY_HINT = "Install a compatible llama-cpp-python build manually.";

/**
 * FILL FIELDS: check the Qwen3.5 files, then expand the description.
 * Resolves true when the wizard should close (filled, stale, or the failure
 * was reported), false to keep it open for another try.
 */
export async function fillCostumeFields(
  ticket: CostumeTicket,
  description: string,
  gate: QwenModelGate,
  onPhase: (phase: WizardPhase) => void
): Promise<boolean> {
  const designer = clothesSession();
  const isCurrent = () => designer.isWizardCurrent(ticket);
  if (!isCurrent()) {
    return true;
  }
  try {
    onPhase("checking");
    if (!(await gate.ensureReady())) {
      return !isCurrent();
    }
    if (!isCurrent()) {
      return true;
    }
    onPhase("thinking");
    await designer.runWizard(ticket, description);
    return true;
  } catch (error) {
    if (!isCurrent()) {
      return true;
    }
    const failure = wizardFailure(error);
    if (!failure) {
      toast.error("Clothes Wizard Error", { description: errorText(error) });
      return false;
    }
    if (failure.code === "DEPENDENCY_MISSING") {
      toast.error("Dependency Missing", {
        description: `${failure.message} ${DEPENDENCY_HINT}`,
        duration: 15_000,
      });
    } else if (isModelFileError(failure.code)) {
      offerModelDownload(gate, failure);
    } else {
      toast.error("Clothes Wizard Error", {
        description:
          failure.message ||
          failure.raw ||
          "Failed to generate clothes description.",
      });
    }
    return true;
  }
}

async function offerModelDownload(
  gate: QwenModelGate,
  failure: WizardFailure
): Promise<void> {
  try {
    if (await gate.offerDownload(failure)) {
      toast.success("Model installed", {
        description: "Open the Clothes Wizzard again.",
      });
    }
  } catch (reason) {
    toast.error("Error", { description: errorText(reason) });
  }
}

// --- Queue --------------------------------------------------------------------------

export const CLOTHES_GENERATOR: GeneratorTarget = {
  kind: "clothes",
  nodeId: CLOTHES_IDS.generator,
};

/**
 * Queue Step 2 (Control Center → Clothes Designer → Pose Studio → Clothes
 * Generator), with the checks the node and widgets ran before ComfyUI's
 * queue. Resolves true once the run finished.
 */
export async function queueClothesSheets(
  sources: GeneratorSources
): Promise<boolean> {
  const designer = clothesSession();
  designer.syncControlCenter();
  const model = designer.model();
  const problem = model?.runProblem();
  if (!model || problem) {
    toast.error(problem?.title ?? "Clothes Designer not ready", {
      description: problem?.message ?? "Wait for the Clothes Designer to load.",
    });
    return false;
  }
  if (designer.ui.deleting || designer.ui.loadingCostume) {
    toast.error("Clothes Designer is busy", {
      description: "Wait for the costume to finish loading, then try again.",
    });
    return false;
  }
  const host = usePoseStudioStore.getState().host;
  if (!(host?.nodeId === CLOTHES_IDS.pose && host.ready)) {
    toast.error("Pose Studio is not ready", {
      description:
        host?.error ??
        "Wait for Pose Studio to finish loading, then try again.",
    });
    return false;
  }
  syncGenerator(CLOTHES_GENERATOR, sources);
  const seedvrProblem = nativeSeedvrProblem(
    generatorData(CLOTHES_GENERATOR),
    useGeneratorStore.getState().schemas
  );
  if (seedvrProblem) {
    toast.error("ComfyUI Update Required", { description: seedvrProblem });
    return false;
  }
  try {
    // Typed fields are only saved on change; the run reads the saved costume.
    await designer.saveCostume();
  } catch (error) {
    toast.error("Save Failed", { description: errorText(error) });
    return false;
  }
  designer.update((next) => {
    next.randomizeSeedIfNeeded();
  });
  const state = designer.state;
  if (!state) {
    return false;
  }
  const { nodeState, repoId } = useControlCenterStore.getState();
  const prompt = buildClothesPrompt({
    controlCenter: { nodeState, repoId },
    source: { widgetData: serializeClothesState(state) },
    poseStudio: { poseData: currentPoseData(CLOTHES_IDS.pose) },
    generator: { widgetData: prepareGeneratorRun(CLOTHES_GENERATOR) },
  });
  try {
    await runPrompt(
      `Clothes sheets · ${state.character} · ${state.costume}`,
      prompt
    );
    return true;
  } catch (error) {
    toast.error("Run failed", { description: errorText(error) });
    return false;
  }
}
