"""Release the models VNCCS Studio loaded once the app no longer needs them.

ComfyUI only tracks its own model patchers. VNCCS previews and Regenerate keep
more models in module caches, and Pose Studio (VNCCS-Utils) keeps SAM 3D Body
and BiRefNet lite on the GPU, so the app's release covers those as well.
"""

import asyncio
import gc
import sys
import time

from aiohttp import web

from ..utils import privileged_route
from .runtime_cleanup import cleanup_runtime, inference_lock

RELEASE_MEMORY_ROUTE = "/vnccs/studio/release_memory"
# "gpu" frees VRAM but keeps RAM copies that make the next preview and Regenerate fast; "all" frees both.
SCOPES = ("gpu", "all")
QUEUE_IDLE_WAIT_SECONDS = 2.0
WORKER_WAIT_SECONDS = 10.0
_POSE_STUDIO_PROCESS = "vnccs_sam3d.processing.process"
_POSE_STUDIO_BIREFNET = "vnccs_sam3d.processing.birefnet_mask"


def release_pose_studio_models():
    """Forget Pose Studio's cached models; the pack folder name varies, so match module suffixes."""
    for name, module in list(sys.modules.items()):
        if name.endswith(_POSE_STUDIO_PROCESS):
            cache = getattr(module, "_MODEL_CACHE", None)
            if isinstance(cache, dict):
                cache.clear()
        elif name.endswith(_POSE_STUDIO_BIREFNET) and hasattr(module, "_MODEL_LOCK"):
            with module._MODEL_LOCK:
                module._MODEL = None
                module._DEVICE = None


def release_vnccs_caches():
    from .character_creator_v2 import release_preview_cache
    from .generator_context import forget_idle_generator_contexts
    from .vnccs_control_center import release_model_assets

    release_preview_cache()
    release_model_assets()
    forget_idle_generator_contexts()


def _unload_models():
    try:
        import comfy.model_management as model_management
    except ImportError:
        return
    model_management.unload_all_models()
    cleanup_runtime()
    gc.collect()
    model_management.soft_empty_cache()


def release_caches(scope):
    """Free models unless a preview or VNCCS stage holds them. Returns False when busy."""
    if not inference_lock.acquire(blocking=False):
        return False
    try:
        release_pose_studio_models()
        if scope == "all":
            release_vnccs_caches()
        _unload_models()
    finally:
        inference_lock.release()
    return True


async def _wait_until(condition, seconds):
    deadline = time.monotonic() + seconds
    while not condition():
        if time.monotonic() >= deadline:
            return False
        await asyncio.sleep(0.05)
    return True


async def release_memory(prompt_queue, scope):
    """Release models between jobs. Returns False when a job is still running."""
    if not await _wait_until(lambda: prompt_queue.get_tasks_remaining() == 0, QUEUE_IDLE_WAIT_SECONDS):
        return False
    if not await asyncio.get_running_loop().run_in_executor(None, release_caches, scope):
        return False
    # The prompt worker owns the executor's node cache, which also holds models
    # (background removers, detectors). Unloading is done above under the
    # inference lock, so the worker must only reset its cache and collect.
    prompt_queue.set_flag("unload_models", False)
    prompt_queue.set_flag("free_memory", True)
    await _wait_until(lambda: not prompt_queue.get_flags(reset=False), WORKER_WAIT_SECONDS)
    return True


def register_studio_memory_routes(routes, prompt_queue):
    @routes.post(RELEASE_MEMORY_ROUTE)
    @privileged_route
    async def vnccs_studio_release_memory(request):
        try:
            body = await request.json()
        except ValueError:
            body = None
        scope = body.get("scope") if isinstance(body, dict) else None
        if scope not in SCOPES:
            return web.json_response({"error": "scope must be \"gpu\" or \"all\""}, status=400)
        if not await release_memory(prompt_queue, scope):
            return web.json_response({"busy": True, "error": "A generation is still running"}, status=409)
        print(f"[VNCCS Studio] Released {'GPU' if scope == 'gpu' else 'all'} model memory")
        return web.json_response({"released": scope})
