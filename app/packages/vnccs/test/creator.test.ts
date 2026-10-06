import { describe, expect, it } from "vitest";
import {
  fetchCharacterInfo,
  fetchPosePreviewCount,
  fetchQueueBusy,
  normalizeSpriteIndex,
  posePreviewUrl,
  runCharacterWizard,
} from "../src/creator";
import { VnccsHttp } from "../src/http";

function httpAnswering(body: unknown, status = 200) {
  const calls: string[] = [];
  const http = new VnccsHttp("http://127.0.0.1:8188", (input) => {
    calls.push(input);
    return Promise.resolve(Response.json(body, { status }));
  });
  return { calls, http };
}

describe("creator routes", () => {
  it("wraps sprite indices in both directions", () => {
    expect(normalizeSpriteIndex(0, 4)).toBe(0);
    expect(normalizeSpriteIndex(4, 4)).toBe(0);
    expect(normalizeSpriteIndex(-1, 4)).toBe(3);
    expect(normalizeSpriteIndex(5, 0)).toBe(0);
  });

  it("builds the pose sprite URL with the cache bust", () => {
    const { http } = httpAnswering({});
    expect(posePreviewUrl(http, "Ann", 2, "")).toBe(
      "http://127.0.0.1:8188/api/vnccs/get_character_pose_preview?character=Ann&index=2&v=current"
    );
    expect(posePreviewUrl(http, "Ann", 2, "Ann:1")).toContain("v=Ann%3A1");
  });

  it("rejects metadata that names another character", async () => {
    const { http } = httpAnswering({ name: "Bob", age: 20 });
    await expect(fetchCharacterInfo(http, "Ann")).rejects.toThrow(
      "Invalid character metadata for 'Ann'"
    );
    const ok = httpAnswering({ name: "Ann", age: 20 });
    await expect(fetchCharacterInfo(ok.http, "Ann")).resolves.toEqual({
      name: "Ann",
      age: 20,
    });
  });

  it("reads the sprite count and treats failures as none", async () => {
    const { http } = httpAnswering({ count: 3 });
    await expect(fetchPosePreviewCount(http, "Ann")).resolves.toBe(3);
    const failing = httpAnswering({ error: "missing" }, 404);
    await expect(fetchPosePreviewCount(failing.http, "Ann")).resolves.toBe(0);
  });

  it("reports the wizard's readable message", async () => {
    const { http } = httpAnswering(
      { code: "llama_cpp_missing", message: "Install llama-cpp-python." },
      500
    );
    await expect(runCharacterWizard(http, "elf", "818")).rejects.toThrow(
      "Install llama-cpp-python."
    );
  });

  it("is busy while ComfyUI runs or holds prompts", async () => {
    const idle = httpAnswering({ queue_running: [], queue_pending: [] });
    await expect(fetchQueueBusy(idle.http)).resolves.toBe(false);
    const busy = httpAnswering({ queue_running: [[1]], queue_pending: [] });
    await expect(fetchQueueBusy(busy.http)).resolves.toBe(true);
    const invalid = httpAnswering({});
    await expect(fetchQueueBusy(invalid.http)).rejects.toThrow(
      "Invalid queue response"
    );
  });
});
