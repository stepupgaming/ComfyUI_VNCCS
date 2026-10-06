import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { VnccsHttp } from "@workspace/vnccs/http";
import { type ComfyHost, comfyHost } from "@workspace/vnccs/runner";

let http: VnccsHttp | null = null;

/** REST client for the configured ComfyUI, rebuilt when the URL changes. */
export function studioHttp(): VnccsHttp {
  const { comfyUrl } = useSettingsStore.getState();
  if (http?.baseUrl !== comfyUrl) {
    http = new VnccsHttp(comfyUrl);
  }
  return http;
}

/** comfy-ts host for the configured ComfyUI. */
export function studioHost(): ComfyHost {
  return comfyHost(useSettingsStore.getState().comfyUrl);
}
