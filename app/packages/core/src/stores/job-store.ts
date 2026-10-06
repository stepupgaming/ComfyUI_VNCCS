import type {
  ExecutionPreview,
  ExecutionProgress,
} from "@workspace/vnccs/runner";
import { create } from "zustand";

export interface Job {
  error: string | null;
  label: string;
  nodeName: string | null;
  nodeProgress: { max: number; value: number } | null;
  percent: number;
  previewUrl: string | null;
  promptId: string | null;
  startedAt: number;
  status: "queued" | "running" | "done" | "failed";
}

interface JobState {
  current: Job | null;
  fail: (error: string) => void;
  finish: () => void;
  preview: (preview: ExecutionPreview) => void;
  progress: (progress: ExecutionProgress) => void;
  start: (label: string) => void;
}

function releasePreview(job: Job | null) {
  if (job?.previewUrl) {
    URL.revokeObjectURL(job.previewUrl);
  }
}

export const useJobStore = create<JobState>()((set, get) => ({
  current: null,
  start: (label) => {
    releasePreview(get().current);
    set({
      current: {
        error: null,
        label,
        nodeName: null,
        nodeProgress: null,
        percent: 0,
        previewUrl: null,
        promptId: null,
        startedAt: Date.now(),
        status: "queued",
      },
    });
  },
  progress: (progress) => {
    const job = get().current;
    if (!job) {
      return;
    }
    set({
      current: {
        ...job,
        status: "running",
        promptId: progress.promptId,
        percent: progress.percent,
        nodeName: progress.nodeName,
        nodeProgress: progress.nodeProgress,
      },
    });
  },
  preview: (preview) => {
    const job = get().current;
    if (!job) {
      return;
    }
    releasePreview(job);
    const blob = new Blob([preview.bytes as Uint8Array<ArrayBuffer>], {
      type: preview.mime,
    });
    set({ current: { ...job, previewUrl: URL.createObjectURL(blob) } });
  },
  finish: () => {
    const job = get().current;
    if (job) {
      set({ current: { ...job, status: "done", percent: 100 } });
    }
  },
  fail: (error) => {
    const job = get().current;
    if (job) {
      set({ current: { ...job, status: "failed", error } });
    }
  },
}));
