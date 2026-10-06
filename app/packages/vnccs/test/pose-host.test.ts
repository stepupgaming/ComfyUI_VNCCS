import { describe, expect, it } from "vitest";
import {
  characterMessage,
  HOST_SOURCE,
  hostOrigin,
  initMessage,
  parseHostMessage,
  poseHostUrl,
  STUDIO_SOURCE,
} from "../src/pose-host";

describe("pose host", () => {
  it("builds the host page URL for a node", () => {
    expect(poseHostUrl("http://127.0.0.1:8188/", "703")).toBe(
      "http://127.0.0.1:8188/vnccs/studio/pose_host?node=703"
    );
    expect(poseHostUrl("http://127.0.0.1:8188", "a b")).toBe(
      "http://127.0.0.1:8188/vnccs/studio/pose_host?node=a%20b"
    );
  });

  it("derives the origin the host posts from", () => {
    expect(hostOrigin("http://127.0.0.1:8188/api")).toBe(
      "http://127.0.0.1:8188"
    );
    expect(hostOrigin("not a url")).toBeNull();
  });

  it("accepts the host messages", () => {
    const base = { source: HOST_SOURCE, nodeId: "703" };
    expect(parseHostMessage({ ...base, type: "hello" })).toEqual({
      nodeId: "703",
      type: "hello",
    });
    expect(
      parseHostMessage({ ...base, type: "state", poseData: '{"poses":[]}' })
    ).toEqual({ nodeId: "703", poseData: '{"poses":[]}', type: "state" });
    expect(parseHostMessage({ ...base, type: "status", ready: true })).toEqual({
      nodeId: "703",
      ready: true,
      type: "status",
    });
    expect(parseHostMessage({ ...base, type: "status", ready: "yes" })).toEqual(
      { nodeId: "703", ready: false, type: "status" }
    );
    expect(
      parseHostMessage({ ...base, type: "error", message: "No WebGL" })
    ).toEqual({ message: "No WebGL", nodeId: "703", type: "error" });
  });

  it("rejects messages that are not from the host or are malformed", () => {
    expect(parseHostMessage(null)).toBeNull();
    expect(parseHostMessage("hello")).toBeNull();
    expect(parseHostMessage({ type: "hello", nodeId: "703" })).toBeNull();
    expect(
      parseHostMessage({ source: STUDIO_SOURCE, type: "hello", nodeId: "703" })
    ).toBeNull();
    expect(parseHostMessage({ source: HOST_SOURCE, type: "hello" })).toBeNull();
    expect(
      parseHostMessage({ source: HOST_SOURCE, nodeId: "703", type: "state" })
    ).toBeNull();
    expect(
      parseHostMessage({ source: HOST_SOURCE, nodeId: "703", type: "reload" })
    ).toBeNull();
  });

  it("builds the app messages", () => {
    const character = { age: 20, sex: "female" };
    expect(initMessage(null, character)).toEqual({
      character,
      poseData: null,
      source: STUDIO_SOURCE,
      type: "init",
    });
    expect(characterMessage(character)).toEqual({
      character,
      source: STUDIO_SOURCE,
      type: "character",
    });
  });
});
