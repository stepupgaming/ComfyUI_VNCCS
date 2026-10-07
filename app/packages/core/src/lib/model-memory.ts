import { studioHttp } from "@workspace/core/lib/studio";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { ModelMemory, releaseModelMemory } from "@workspace/vnccs/model-memory";

/** The studio's model lifetime policy; every action that loads models runs through it. */
export const modelMemory = new ModelMemory({
  idleLimits: () => {
    const { gpuIdleMinutes, memoryIdleMinutes } = useSettingsStore.getState();
    return { allMinutes: memoryIdleMinutes, gpuMinutes: gpuIdleMinutes };
  },
  release: (scope) => releaseModelMemory(studioHttp(), scope),
});
