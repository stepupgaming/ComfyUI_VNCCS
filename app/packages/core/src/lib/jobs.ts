import { modelMemory } from "@workspace/core/lib/model-memory";
import { studioHost } from "@workspace/core/lib/studio";
import { useJobStore } from "@workspace/core/stores/job-store";
import type { ApiPrompt } from "@workspace/vnccs/prompt";
import {
  type ComfyExecution,
  executionFailureMessage,
  startPrompt,
} from "@workspace/vnccs/runner";

/**
 * Queue a prompt that loads `family`'s models and mirror its progress and
 * previews into the status bar.
 */
export async function runPrompt(
  label: string,
  prompt: ApiPrompt,
  family: string
): Promise<ComfyExecution> {
  const jobs = useJobStore.getState();
  jobs.start(label);
  try {
    const execution = await modelMemory.run(family, async () => {
      const started = await startPrompt(studioHost(), prompt, {
        onProgress: jobs.progress,
        onPreview: jobs.preview,
      });
      await started.done;
      return started;
    });
    if (execution.status === "Failure") {
      throw new Error(executionFailureMessage(execution));
    }
    jobs.finish();
    return execution;
  } catch (error) {
    jobs.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
