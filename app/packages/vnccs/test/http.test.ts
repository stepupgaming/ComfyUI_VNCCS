import { describe, expect, it } from "vitest";
import { VnccsHttp, VnccsRequestError } from "../src/http";

function recorder(response: Response) {
  const calls: { init?: RequestInit; input: string }[] = [];
  const send = (input: string, init?: RequestInit) => {
    calls.push({ input, init });
    return Promise.resolve(response.clone());
  };
  return { calls, send };
}

describe("VnccsHttp", () => {
  it("routes through /api and encodes the query", async () => {
    const { calls, send } = recorder(Response.json({ ok: true }));
    const http = new VnccsHttp("http://127.0.0.1:8188/", send);
    await http.get("/vnccs/get_costume", { character: "A b", costume: "x/y" });
    expect(calls[0]?.input).toBe(
      "http://127.0.0.1:8188/api/vnccs/get_costume?character=A+b&costume=x%2Fy"
    );
    expect(calls[0]?.init?.cache).toBe("no-store");
  });

  it("posts JSON without a CSRF marker header", async () => {
    const { calls, send } = recorder(Response.json({ ok: true }));
    const http = new VnccsHttp("http://127.0.0.1:8188", send);
    await http.post("/vnccs/save_costume", { character: "A" });
    const init = calls[0]?.init;
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"character":"A"}');
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("raises the server error message", async () => {
    const { send } = recorder(
      Response.json({ error: "Character not found" }, { status: 404 })
    );
    const http = new VnccsHttp("http://127.0.0.1:8188", send);
    const error = await http
      .get("/vnccs/character_info")
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(VnccsRequestError);
    expect(error).toMatchObject({
      message: "Character not found",
      status: 404,
    });
  });

  it("treats an error field on HTTP 200 as a failure", async () => {
    const { send } = recorder(Response.json({ error: "busy" }));
    const http = new VnccsHttp("http://127.0.0.1:8188", send);
    await expect(http.post("/vnccs/preview_generate")).rejects.toThrow("busy");
  });

  it("rejects a non-JSON response", async () => {
    const { send } = recorder(new Response("<html>", { status: 502 }));
    const http = new VnccsHttp("http://127.0.0.1:8188", send);
    await expect(http.get("/vnccs/config")).rejects.toThrow(
      "Invalid server response (HTTP 502)"
    );
  });

  it("resolves stored media paths", () => {
    const http = new VnccsHttp("http://127.0.0.1:8188");
    expect(http.mediaUrl("/vnccs/get_preview?character=A")).toBe(
      "http://127.0.0.1:8188/api/vnccs/get_preview?character=A"
    );
    expect(http.mediaUrl("/view?filename=a.png")).toBe(
      "http://127.0.0.1:8188/api/view?filename=a.png"
    );
    expect(http.mediaUrl("/api/view?filename=a.png")).toBe(
      "http://127.0.0.1:8188/api/view?filename=a.png"
    );
    expect(http.mediaUrl("data:image/png;base64,AA")).toBe(
      "data:image/png;base64,AA"
    );
  });
});
