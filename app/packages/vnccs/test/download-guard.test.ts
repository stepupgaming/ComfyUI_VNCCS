import { describe, expect, it } from "vitest";
import {
  type CatalogEntry,
  DOWNLOAD_CATEGORIES,
  requestDownload,
} from "../src/control-center";
import {
  DownloadBlockedError,
  downloadBlockReason,
  normalizeKind,
} from "../src/download-guard";
import { VnccsHttp } from "../src/http";
import { liveCatalog } from "./fixtures/catalog";

const PROTECTED = new Set(["qi2", "minimaxh3", "klein9b"]);

function names(entries: CatalogEntry[]): string[] {
  return entries.map((entry) => entry.name);
}

describe("download guard", () => {
  it("normalizes family spellings like the server", () => {
    expect(normalizeKind("H3")).toBe("minimaxh3");
    expect(normalizeKind("MiniMax-H3")).toBe("minimaxh3");
    expect(normalizeKind(" QI2 ")).toBe("qi2");
    expect(normalizeKind(undefined)).toBe("");
  });

  it("blocks every Qwen Image 2.1, MiniMax H3 and Flux base weight in the live catalog", () => {
    const catalog = liveCatalog();
    for (const category of ["models", "clip", "vae"] as const) {
      for (const entry of catalog[category]) {
        const reason = downloadBlockReason(category, entry);
        if (PROTECTED.has(normalizeKind(entry.kind))) {
          expect(reason, entry.name).not.toBeNull();
        } else {
          expect(reason, entry.name).toBeNull();
        }
      }
    }
  });

  it("allows the approved LoRAs and blocks Klein9b LoRAs", () => {
    const catalog = liveCatalog();
    const allowed = catalog.lora.filter(
      (entry) => downloadBlockReason("lora", entry) === null
    );
    expect(names(allowed)).toEqual([
      "MiniMax H3 Pose Studio",
      "TaoMate-H3 3-Step LoRA",
      "VNCCS Pose Studio QI2",
      "VNCCS Clothes Core QI2",
      "Qwen Image 2.1 Viggle Turbo",
      "Anima Turbo LoRA",
    ]);
    expect(
      downloadBlockReason("lora", {
        name: "MiniMax H3 Ref2V Turbo 8-Step 768p",
        kind: "minimaxh3",
        hf_repo: "lightx2v/Minimax-h3-Turbo",
        hf_path:
          "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors",
      })
    ).toBeNull();
  });

  it("blocks protected repositories and weight file names in any category", () => {
    for (const category of DOWNLOAD_CATEGORIES) {
      expect(
        downloadBlockReason(category, {
          name: "anything",
          hf_repo: "Comfy-Org/Qwen-Image-2.1",
        })
      ).not.toBeNull();
    }
    expect(
      downloadBlockReason("other", {
        name: "VAE",
        local_path: "models/vae/flux2-vae.safetensors",
      })
    ).not.toBeNull();
    expect(
      downloadBlockReason("controlnet", {
        name: "Union",
        hf_path: "minimax_h3_union_controlnet.safetensors",
      })
    ).not.toBeNull();
    expect(
      downloadBlockReason("lora", {
        name: "Flux detailer",
        local_path: "models/loras/flux_detail.safetensors",
      })
    ).not.toBeNull();
  });
});

describe("requestDownload", () => {
  function recorder() {
    const calls: { body: unknown; input: string }[] = [];
    const http = new VnccsHttp("http://127.0.0.1:8188", (input, init) => {
      calls.push({ input, body: JSON.parse(String(init?.body)) });
      return Promise.resolve(Response.json({ status: "queued" }));
    });
    return { calls, http };
  }

  it("never sends a blocked entry", async () => {
    const { calls, http } = recorder();
    await expect(
      requestDownload(
        http,
        "MIUProject/VNCCS_v3.0",
        liveCatalog(),
        "models",
        "MiniMax H3 Ref2VA Pruned FP8 Scaled"
      )
    ).rejects.toBeInstanceOf(DownloadBlockedError);
    expect(calls).toEqual([]);
  });

  it("refuses names that are not in the catalog", async () => {
    const { calls, http } = recorder();
    await expect(
      requestDownload(
        http,
        "MIUProject/VNCCS_v3.0",
        liveCatalog(),
        "lora",
        "Unknown"
      )
    ).rejects.toThrow("not in the lora catalog");
    expect(calls).toEqual([]);
  });

  it("queues an allowed entry by category and name", async () => {
    const { calls, http } = recorder();
    await requestDownload(
      http,
      "MIUProject/VNCCS_v3.0",
      liveCatalog(),
      "lora",
      "VNCCS Pose Studio QI2"
    );
    expect(calls).toEqual([
      {
        input: "http://127.0.0.1:8188/api/vnccs/control_center/download",
        body: {
          repo_id: "MIUProject/VNCCS_v3.0",
          category: "lora",
          name: "VNCCS Pose Studio QI2",
        },
      },
    ]);
  });
});
