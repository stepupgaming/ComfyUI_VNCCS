import { studioHost } from "@workspace/core/lib/studio";
import { useJobStore } from "@workspace/core/stores/job-store";
import type { ApiPrompt } from "@workspace/vnccs/prompt";
import { type ComfyExecution, startPrompt } from "@workspace/vnccs/runner";

function failureMessage(execution: ComfyExecution): string {
  const error = execution.data.error as
    | { exception_message?: string; node_type?: string }
    | null
    | undefined;
  if (error?.exception_message) {
    return error.node_type
      ? `${error.node_type}: ${error.exception_message}`
      : error.exception_message;
  }
  return "The run failed";
}

/** Queue a prompt and mirror its progress and previews into the status bar. */
export async function runPrompt(
  label: string,
  prompt: ApiPrompt
): Promise<ComfyExecution> {
  const jobs = useJobStore.getState();
  jobs.start(label);
  try {
    const execution = await startPrompt(studioHost(), prompt, {
      onProgress: jobs.progress,
      onPreview: jobs.preview,
    });
    await execution.done;
    if (execution.status === "Failure") {
      throw new Error(failureMessage(execution));
    }
    jobs.finish();
    return execution;
  } catch (error) {
    jobs.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
