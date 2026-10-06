"use client";

import { studioHttp } from "@workspace/core/lib/studio";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Progress } from "@workspace/ui/components/progress";
import {
  fetchWizardDownloadStatus,
  fetchWizardModelStatus,
  startWizardModelDownload,
  type WizardFailure,
} from "@workspace/vnccs/creator";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const POLL_MS = 700;
const CLOSE_DELAY_MS = 450;

type GatePhase =
  | { kind: "idle" }
  | { kind: "confirm"; message: string; title: string }
  | { kind: "downloading"; done: boolean; file: string; progress: number };

interface Pending {
  reject: (reason: unknown) => void;
  resolve: (ok: boolean) => void;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The widgets' "Model Missing" text for a failed analysis or wizard call. */
export function modelFailureMessage(failure: WizardFailure): string {
  const model = failure.model || "QwenVL";
  if (failure.code === "MMPROJ_MISSING") {
    return "The Vision Projector (mmproj) is missing.";
  }
  if (failure.code === "MMPROJ_INVALID") {
    return "The Vision Projector (mmproj) is invalid or incomplete.";
  }
  if (failure.code === "MODEL_INVALID") {
    return `Model file is invalid or incomplete: ${model}`;
  }
  return `Required Model: ${model}`;
}

export interface QwenModelGate {
  /** The confirm and progress dialogs; render it once on the page. */
  dialog: ReactNode;
  /**
   * The widgets' `ensureQwenVLReady`: true when the model files are on disk,
   * after asking to download them when they are not. False when declined;
   * rejects when the check or the download fails.
   */
  ensureReady: () => Promise<boolean>;
  /** Ask to download after a call failed with a missing or invalid model file. */
  offerDownload: (failure: WizardFailure) => Promise<boolean>;
}

/**
 * Qwen3.5 model files for the local wizards. Nothing downloads without an
 * explicit click on Download & install.
 */
export function useQwenModelGate({
  vision,
}: {
  vision: boolean;
}): QwenModelGate {
  const [phase, setPhase] = useState<GatePhase>({ kind: "idle" });
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, []);

  const settle = useCallback((ok: boolean | Error) => {
    const current = pending.current;
    pending.current = null;
    if (ok instanceof Error) {
      setPhase({ kind: "idle" });
      current?.reject(ok);
    } else {
      current?.resolve(ok);
    }
  }, []);

  const ask = useCallback(
    (title: string, message: string) =>
      new Promise<boolean>((resolve, reject) => {
        pending.current?.resolve(false);
        pending.current = { resolve, reject };
        setPhase({ kind: "confirm", message, title });
      }),
    []
  );

  const ensureReady = useCallback(async () => {
    const status = await fetchWizardModelStatus(studioHttp(), { vision });
    if (status.ready) {
      return true;
    }
    return ask(
      "Qwen3.5 Model Required",
      `${status.message || status.model_name || "The Qwen3.5 model is not installed."} Download the required files from Hugging Face now?`
    );
  }, [ask, vision]);

  const offerDownload = useCallback(
    (failure: WizardFailure) => {
      const invalid =
        failure.code === "MODEL_INVALID" || failure.code === "MMPROJ_INVALID";
      return ask(
        "Model Missing",
        `${modelFailureMessage(failure)} ${invalid ? "The existing file will be replaced." : "This component is required."} Download it from Hugging Face now?`
      );
    },
    [ask]
  );

  const download = async () => {
    setPhase({ kind: "downloading", done: false, file: "", progress: 0 });
    try {
      const http = studioHttp();
      await startWizardModelDownload(http, { vision });
      while (mounted.current) {
        const status = await fetchWizardDownloadStatus(http);
        const progress = Math.max(
          0,
          Math.min(100, Number(status.progress) || 0)
        );
        if (status.status === "completed") {
          setPhase({
            kind: "downloading",
            done: true,
            file: "",
            progress: 100,
          });
          settle(true);
          await delay(CLOSE_DELAY_MS);
          if (mounted.current) {
            setPhase({ kind: "idle" });
          }
          return;
        }
        if (status.status === "error") {
          throw new Error(status.error || "QwenVL download failed.");
        }
        setPhase({
          kind: "downloading",
          done: false,
          file: status.current_file ?? "",
          progress,
        });
        await delay(POLL_MS);
      }
    } catch (reason) {
      settle(reason instanceof Error ? reason : new Error(String(reason)));
    }
  };

  const decline = () => {
    setPhase({ kind: "idle" });
    settle(false);
  };

  let dialog: ReactNode = null;
  if (phase.kind === "confirm") {
    dialog = (
      <Dialog onOpenChange={(open) => open || decline()} open={true}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{phase.title}</DialogTitle>
            <DialogDescription>{phase.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={decline} variant="outline">
              Cancel
            </Button>
            <Button onClick={download}>Download & install</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  } else if (phase.kind === "downloading") {
    let status = "Preparing model files…";
    if (phase.done) {
      status = "Download complete!";
    } else if (phase.file) {
      status = `Downloading ${phase.file}…`;
    }
    dialog = (
      <Dialog open={true}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Downloading model…</DialogTitle>
            <DialogDescription>{status}</DialogDescription>
          </DialogHeader>
          <Progress value={phase.progress} />
          <p className="text-muted-foreground text-xs tabular-nums">
            {phase.progress}%
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return { dialog, ensureReady, offerDownload };
}
