import { describe, expect, it } from "vitest";
import { VnccsHttp } from "../src/http";
import {
  imageRef,
  normalizeUploadName,
  uploadImage,
  viewUrl,
} from "../src/uploads";

const BASE = "http://127.0.0.1:8188";

describe("upload names", () => {
  it("keeps clean names untouched", () => {
    expect(normalizeUploadName("donor.png", "clone_reference")).toBe(
      "donor.png"
    );
    expect(normalizeUploadName("a_b-c.1.webp", "clone_source")).toBe(
      "a_b-c.1.webp"
    );
  });

  it("prefixes any rewritten name", () => {
    expect(normalizeUploadName("my photo.png", "clone_source")).toBe(
      "clone_source_my_photo.png"
    );
    expect(
      normalizeUploadName("../dir\\évil name.jpg", "clone_reference")
    ).toBe("clone_reference__dir__vil_name.jpg");
    expect(normalizeUploadName("  .hidden.png  ", "p")).toBe("p_hidden.png");
  });

  it("replaces names without letters or digits", () => {
    expect(normalizeUploadName("___", "clone_source", 42)).toBe(
      "clone_source_clone_source_42.png"
    );
    expect(normalizeUploadName("--.webp", "clone_source", 42)).toBe(
      "clone_source_webp"
    );
    expect(normalizeUploadName("§§.webp", "clone_source", 42)).toBe(
      "clone_source___.webp"
    );
    expect(normalizeUploadName("", "clone_reference", 7)).toBe(
      "clone_reference_clone_reference_7.png"
    );
  });
});

describe("image references", () => {
  it("reads legacy strings and objects", () => {
    expect(imageRef("a.png")).toEqual({
      name: "a.png",
      type: "input",
      subfolder: "",
    });
    expect(imageRef({ name: "b.png", subfolder: "clothes" })).toEqual({
      name: "b.png",
      type: "input",
      subfolder: "clothes",
    });
    expect(imageRef({ name: "" })).toBeNull();
    expect(imageRef(null)).toBeNull();
    expect(imageRef(["a.png"])).toBeNull();
  });

  it("builds /view URLs", () => {
    const http = new VnccsHttp(BASE);
    expect(
      viewUrl(http, { name: "a b.png", type: "input", subfolder: "" })
    ).toBe(`${BASE}/api/view?filename=a+b.png&type=input`);
    expect(
      viewUrl(http, { name: "d.png", type: "temp", subfolder: "clothes" })
    ).toBe(`${BASE}/api/view?filename=d.png&type=temp&subfolder=clothes`);
    expect(viewUrl(http, null)).toBe("");
  });
});

describe("uploadImage", () => {
  it("posts the normalized file and extra fields", async () => {
    const sent: { fields: [string, FormDataEntryValue][]; url: string }[] = [];
    const http = new VnccsHttp(BASE, (url, init) => {
      const form = init?.body as FormData;
      sent.push({ url, fields: [...form.entries()] });
      return Promise.resolve(
        Response.json({
          name: "clone_reference_my_shirt.png",
          subfolder: "",
          type: "input",
        })
      );
    });
    const file = new File(["x"], "my shirt.png", { type: "image/png" });
    await expect(
      uploadImage(http, file, {
        prefix: "clone_reference",
        fields: { type: "input", overwrite: "true" },
      })
    ).resolves.toEqual({
      name: "clone_reference_my_shirt.png",
      type: "input",
      subfolder: "",
    });
    expect(sent[0]?.url).toBe(`${BASE}/api/upload/image`);
    const fields = sent[0]?.fields ?? [];
    expect((fields[0]?.[1] as File).name).toBe("clone_reference_my_shirt.png");
    expect(fields.slice(1)).toEqual([
      ["type", "input"],
      ["overwrite", "true"],
    ]);
  });

  it("rejects a response without a name", async () => {
    const http = new VnccsHttp(BASE, () => Promise.resolve(Response.json({})));
    await expect(
      uploadImage(http, new File(["x"], "a.png"), { prefix: "p" })
    ).rejects.toThrow("Upload response did not include an image name.");
  });
});
