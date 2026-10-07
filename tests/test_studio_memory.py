"""The app's memory release must free every model cache without racing a running job."""

import asyncio
import sys
import threading
import types
from types import SimpleNamespace

import pytest

import utils
from nodes import generator_context, studio_memory
from nodes.runtime_cleanup import inference_lock


class FakeQueue:
    def __init__(self, remaining=0):
        self.remaining = remaining
        self.flags = {}
        self.history = []

    def get_tasks_remaining(self):
        return self.remaining

    def set_flag(self, name, value):
        self.flags[name] = value

    def get_flags(self, reset=True):
        flags = dict(self.flags)
        if reset:
            self.history.append(flags)
            self.flags = {}
        return flags


async def consume_flags(queue):
    """Stand in for ComfyUI's prompt worker, which reads the flags between prompts."""
    for _ in range(200):
        if queue.flags:
            queue.get_flags()
            return
        await asyncio.sleep(0.01)


@pytest.fixture
def released(monkeypatch):
    calls = []
    monkeypatch.setattr(studio_memory, "release_pose_studio_models", lambda: calls.append("pose"))
    monkeypatch.setattr(studio_memory, "release_vnccs_caches", lambda: calls.append("vnccs"))
    monkeypatch.setattr(studio_memory, "_unload_models", lambda: calls.append("unload"))
    return calls


def test_pose_studio_models_are_forgotten_whatever_the_pack_folder_is_called(monkeypatch):
    process = types.ModuleType("custom_nodes.comfyui-vnccs-utils.vnccs_sam3d.processing.process")
    process._MODEL_CACHE = {"ckpt": {"model": object()}}
    birefnet = types.ModuleType("ComfyUI_VNCCS_Utils.vnccs_sam3d.processing.birefnet_mask")
    birefnet._MODEL_LOCK = threading.Lock()
    birefnet._MODEL, birefnet._DEVICE = object(), "cuda"
    unrelated = types.ModuleType("other.processing.process")
    unrelated._MODEL_CACHE = {"keep": object()}
    for module in (process, birefnet, unrelated):
        monkeypatch.setitem(sys.modules, module.__name__, module)

    studio_memory.release_pose_studio_models()

    assert process._MODEL_CACHE == {}
    assert birefnet._MODEL is None and birefnet._DEVICE is None
    assert "keep" in unrelated._MODEL_CACHE


@pytest.mark.parametrize("scope,expected", [("gpu", ["pose", "unload"]), ("all", ["pose", "vnccs", "unload"])])
def test_scope_decides_whether_ram_caches_are_dropped(released, scope, expected):
    assert studio_memory.release_caches(scope)
    assert released == expected


def test_release_waits_for_previews_and_stages_holding_the_inference_lock(released):
    held, done = threading.Event(), threading.Event()

    def preview():
        with inference_lock:
            held.set()
            done.wait(3)

    worker = threading.Thread(target=preview)
    worker.start()
    try:
        assert held.wait(3)
        assert studio_memory.release_caches("all") is False
        assert released == []
    finally:
        done.set()
        worker.join()
    assert studio_memory.release_caches("all")


def test_release_unloads_then_has_the_prompt_worker_reset_only_its_node_cache(released):
    queue = FakeQueue()

    async def scenario():
        worker = asyncio.create_task(consume_flags(queue))
        result = await studio_memory.release_memory(queue, "gpu")
        await worker
        return result

    assert asyncio.run(scenario())
    assert released == ["pose", "unload"]
    # The worker must not unload again: a preview may already be loading its model.
    assert queue.history == [{"unload_models": False, "free_memory": True}]


def test_release_is_refused_while_the_queue_runs_a_job(monkeypatch, released):
    monkeypatch.setattr(studio_memory, "QUEUE_IDLE_WAIT_SECONDS", 0.1)
    queue = FakeQueue(remaining=1)
    assert asyncio.run(studio_memory.release_memory(queue, "all")) is False
    assert released == [] and queue.flags == {}


def test_release_waits_briefly_for_a_job_that_is_just_finishing(released):
    queue = FakeQueue(remaining=1)

    async def scenario():
        async def finish():
            await asyncio.sleep(0.1)
            queue.remaining = 0
            await consume_flags(queue)

        worker = asyncio.create_task(finish())
        result = await studio_memory.release_memory(queue, "all")
        await worker
        return result

    assert asyncio.run(scenario())
    assert released == ["pose", "vnccs", "unload"]


def test_idle_regenerate_contexts_are_dropped_but_running_ones_kept(monkeypatch):
    monkeypatch.setattr(generator_context, "_LIVE_GENERATOR_CONTEXTS", generator_context.OrderedDict())
    monkeypatch.setattr(generator_context, "_execution_locks", {})
    generator_context._LIVE_GENERATOR_CONTEXTS.update({
        "idle": {"pipe": object()},
        "running": {"pipe": object()},
    })
    generator_context._execution_locks["running"] = [threading.RLock(), 1]
    generator_context.forget_idle_generator_contexts()
    assert list(generator_context._LIVE_GENERATOR_CONTEXTS) == ["running"]


class FakeRoutes:
    def __init__(self):
        self.handlers = {}

    def post(self, path):
        def register(handler):
            self.handlers[path] = handler
            return handler
        return register


class FakeRequest:
    headers = {utils.PRIVILEGED_REQUEST_HEADER: utils.PRIVILEGED_REQUEST_VALUE}

    def __init__(self, body):
        self.body = body

    async def json(self):
        if isinstance(self.body, Exception):
            raise self.body
        return self.body


@pytest.fixture
def route(monkeypatch):
    monkeypatch.setattr(studio_memory, "web", SimpleNamespace(json_response=lambda data, status=200: (status, data)))
    routes, queue = FakeRoutes(), FakeQueue()
    studio_memory.register_studio_memory_routes(routes, queue)
    handler = routes.handlers[studio_memory.RELEASE_MEMORY_ROUTE]
    return handler, queue


@pytest.mark.parametrize("body", [{}, {"scope": "vram"}, ["all"], ValueError("bad json")])
def test_route_rejects_unknown_scopes(route, released, body):
    handler, _ = route
    status, data = asyncio.run(handler(FakeRequest(body)))
    assert status == 400 and "scope" in data["error"]
    assert released == []


def test_route_reports_busy_with_a_conflict(monkeypatch, route, released):
    handler, queue = route
    monkeypatch.setattr(studio_memory, "QUEUE_IDLE_WAIT_SECONDS", 0.05)
    queue.remaining = 1
    status, data = asyncio.run(handler(FakeRequest({"scope": "all"})))
    assert status == 409 and data["busy"] is True


def test_route_releases_the_requested_scope(monkeypatch, route, released):
    handler, queue = route
    monkeypatch.setattr(studio_memory, "WORKER_WAIT_SECONDS", 0.05)
    status, data = asyncio.run(handler(FakeRequest({"scope": "all"})))
    assert (status, data) == (200, {"released": "all"})
    assert released == ["pose", "vnccs", "unload"]
